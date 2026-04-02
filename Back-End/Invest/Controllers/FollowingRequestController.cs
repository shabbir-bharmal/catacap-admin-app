using AutoMapper;
using ClosedXML.Excel;
using Invest.Core.Constants;
using Invest.Core.Dtos;
using Invest.Core.Models;
using Invest.Core.Settings;
using Invest.Repo.Data;
using Invest.Service.Interfaces;
using Invest.Service.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Group = Invest.Core.Models.Group;

namespace Invest.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class FollowingRequestController : ControllerBase
    {
        private readonly RepositoryContext _context;
        protected readonly IRepositoryManager _repository;
        private readonly IMapper _mapper;
        private readonly IMailService _mailService;
        private readonly IConfiguration _configuration;
        private readonly EmailQueue _emailQueue;
        private readonly ImageService _imageService;
        private readonly AppSecrets _appSecrets;

        public FollowingRequestController(RepositoryContext context, IRepositoryManager repository, IMapper mapper, IMailService mail, IConfiguration configuration, EmailQueue emailQueue, ImageService imageService, AppSecrets appSecrets)
        {
            _context = context;
            _repository = repository;
            _mapper = mapper;
            _mailService = mail;
            _configuration = configuration;
            _emailQueue = emailQueue;
            _imageService = imageService;
            _appSecrets = appSecrets;
        }

        [HttpPost("get")]
        public async Task<ActionResult<IEnumerable<FollowingRequestDto>>> GetRequestByUser([FromBody] TokenDto tokenData)
        {
            if (tokenData == null)
            {
                return BadRequest();
            }

            var user = await _repository.UserAuthentication.GetUser(tokenData.Token);
            var requests = await _context.Requests.Include(i => i.RequestOwner).Where(item => item.UserToFollow != null && item.UserToFollow.Id == user.Id).Where(item => item.Status == "pending").ToListAsync();
            var data = _mapper.Map<List<FollowingRequest>, List<FollowingRequestDto>>(requests);

            return data != null ? Ok(data) : BadRequest();
        }

        [HttpPost("getByGroups")]
        public async Task<ActionResult<IEnumerable<FollowingRequestDto>>> GetRequestByGroup([FromBody] GroupRequestsDto requestData)
        {
            if (requestData == null)
            {
                return BadRequest();
            }

            var user = await _repository.UserAuthentication.GetUser(requestData.Token);
            var requests = await _context.Requests.Include(i => i.RequestOwner).Include(i => i.GroupToFollow).Where(item => item.GroupToFollow != null && item.GroupToFollow.Id == requestData.GroupId).Where(item => item.Status == "pending").ToListAsync();
            var data = _mapper.Map<List<FollowingRequest>, List<FollowingRequestDto>>(requests);

            return data != null ? Ok(data) : BadRequest();
        }

        [HttpPost("getAcceptedByGroups")]
        public async Task<ActionResult<IEnumerable<FollowingRequestDto>>> GetAcceptedRequestByGroup([FromBody] GroupRequestsDto requestData)
        {
            if (requestData == null)
                return BadRequest();

            if (string.IsNullOrWhiteSpace(requestData.Token))
                return BadRequest("Token is required");

            var user = await _repository.UserAuthentication.GetUser(requestData.Token);

            if (user == null)
                return Unauthorized("Invalid token");

            var requests = await _context.Requests
                                         .Include(i => i.RequestOwner)
                                         .Include(i => i.GroupToFollow)
                                         .Where(item => item.GroupToFollow != null 
                                                && item.GroupToFollow.Id == requestData.GroupId)
                                         .Where(item => item.Status == "accepted")
                                         .ToListAsync();
            
            var data = _mapper.Map<List<FollowingRequest>, List<FollowingRequestDto>>(requests);

            return data != null ? Ok(data) : BadRequest();
        }

        [HttpPost("dataToFollow")]
        public async Task<ActionResult<FollowingPaginationDataDto>> GetDataToFollow([FromBody] FollowDataRequestDto request)
        {
            int defaultPage = 1;
            int defaultPageSize = 10;
            int page = request.Page.HasValue ? request.Page.Value : defaultPage;
            int pageSize = request.PageSize.HasValue ? request.PageSize.Value : defaultPageSize;

            var followingPaginationDataDto = new FollowingPaginationDataDto();

            var user = await _repository.UserAuthentication.GetUser(request.UserToken);
            if (user == null)
            {
                return BadRequest();
            }

            var acceptedRequestsQuery = _context.Requests
                                                .Include(r => r.UserToFollow)
                                                .Include(r => r.RequestOwner)
                                                .Include(r => r.GroupToFollow)
                                                .Where(r => r.RequestOwner != null && r.RequestOwner.Id == user.Id);

            if (request.IsFollowRequest)
            {
                acceptedRequestsQuery = acceptedRequestsQuery
                                                .Where(r => r.Status == "accepted" || r.Status == "pending")
                                                .Where(r =>
                                                        (r.UserToFollow != null && r.UserToFollow.IsActive == true) ||
                                                        (r.GroupToFollow != null));
            }
            else
            {
                acceptedRequestsQuery = acceptedRequestsQuery.Where(r => r.Status == "accepted");
            }

            var acceptedFollowingRequestsByUser = await acceptedRequestsQuery.ToListAsync();

            if (!request.SelectedOption)
            {
                var followingUsersIds = acceptedFollowingRequestsByUser
                                            .Where(r => r.UserToFollow != null)
                                            .Select(r => r.UserToFollow!.Id)
                                            .ToList();

                var usersQuery = _context.Users
                                         .Where(u =>
                                             u.Id != user.Id &&
                                             u.IsActive == true &&
                                             _context.UserRoles
                                                 .Join(_context.Roles,
                                                     ur => ur.RoleId,
                                                     r => r.Id,
                                                     (ur, r) => new { ur, r })
                                                 .Any(x => x.ur.UserId == u.Id && x.r.Name == UserRoles.User) &&
                                             (string.IsNullOrEmpty(request.Search) ||
                                              (u.FirstName != null && u.FirstName.Contains(request.Search)) ||
                                              (u.LastName != null && u.LastName.Contains(request.Search))
                                             )
                                         );

                if (request.IsFollowRequest)
                {
                    usersQuery = usersQuery
                                    .Where(u => !followingUsersIds.Contains(u.Id) && !(u.IsUserHidden ?? false));
                }
                else
                {
                    usersQuery = usersQuery
                                    .Where(u => followingUsersIds.Contains(u.Id));
                }

                var totalUsers = await usersQuery.CountAsync();
                var newPageCount = totalUsers <= pageSize ? 1 : page;
                var filteredUsers = await usersQuery
                    .OrderBy(u => u.Id)
                    .Skip((newPageCount - 1) * pageSize)
                    .Take(pageSize)
                    .ToListAsync();

                var userDtos = _mapper.Map<List<User>, List<FollowingDataDto>>(filteredUsers);

                for (int i = 0; i < filteredUsers.Count; i++)
                {
                    userDtos[i].Identifier = filteredUsers[i].UserName;
                }

                var data = userDtos
                    .OrderBy(d => d.Name)
                    .ToList();

                followingPaginationDataDto.FollowingDataDto = data;
                followingPaginationDataDto.TotalItems = totalUsers;
            }

            if (request.SelectedOption)
            {
                var followingGroupIds = acceptedFollowingRequestsByUser
                    .Where(r => r.GroupToFollow != null)
                    .Select(r => r.GroupToFollow!.Id)
                    .ToList();

                var groupsQuery = _context.Groups
                                            .Include(g => g.Owner)
                                            .Where(g => g.Owner != null
                                                        && g.Owner.Id != user.Id
                                                        && !g.IsDeactivated
                                                        && (string.IsNullOrEmpty(request.Search)
                                                            || (g.Name != null && g.Name.Contains(request.Search))));

                if (request.IsFollowRequest)
                {
                    groupsQuery = groupsQuery
                                        .Where(g => !followingGroupIds.Contains(g.Id) && !g.IsPrivateGroup);
                }
                else
                {
                    groupsQuery = groupsQuery
                                        .Where(g => followingGroupIds.Contains(g.Id));
                }

                var totalGroups = await groupsQuery.CountAsync();
                var groups = await groupsQuery
                                        .OrderBy(g => g.Id)
                                        .Skip((page - 1) * pageSize)
                                        .Take(pageSize)
                                        .ToListAsync();

                var groupDtos = _mapper.Map<List<Group>, List<FollowingDataDto>>(groups);

                var data = groupDtos
                    .OrderBy(d => d.Name)
                    .ToList();

                followingPaginationDataDto.FollowingDataDto = data;
                followingPaginationDataDto.TotalItems = totalGroups;
            }

            return Ok(followingPaginationDataDto);
        }

        [HttpPost]
        public async Task<IActionResult> Create_Request([FromBody] AddFollowingRequestDto addFollowingRequest)
        {
            var user = await _repository.UserAuthentication.GetUser(addFollowingRequest.RequestOwnerToken);
            var data = _mapper.Map<AddFollowingRequestDto, FollowingRequest>(addFollowingRequest);
            data.RequestOwner = user;
            data.CreatedAt = DateTime.Now;

            if (addFollowingRequest.UserToFollowId != null || addFollowingRequest.GroupToFollowId != null)
            {
                bool isAcceptWithoupRequest;
                if (addFollowingRequest.UserToFollowId != null)
                {
                    var userToFollow = await _repository.UserAuthentication.GetUserById(addFollowingRequest.UserToFollowId);
                    data.UserToFollow = userToFollow;
                    isAcceptWithoupRequest = !userToFollow.IsApprouveRequired.GetValueOrDefault();
                }
                else
                {
                    var group = await _context.Groups.Include(g => g.Owner).FirstOrDefaultAsync(item => item.Id == addFollowingRequest.GroupToFollowId);
                    data.GroupToFollow = group;
                    isAcceptWithoupRequest = !group!.IsApprouveRequired.GetValueOrDefault();
                    var userGroupOwner = await _repository.UserAuthentication.GetUserByEmail(group.Owner!.Email);

                    if (!isAcceptWithoupRequest && (userGroupOwner.OptOutEmailNotifications == null || !(bool)userGroupOwner.OptOutEmailNotifications))
                    {
                        var variables = new Dictionary<string, string>
                        {
                            { "logoUrl", await _imageService.GetImageUrl() },
                            { "groupName", group.Name! },
                            { "userFullName", $"{user.FirstName} {user.LastName}" },
                            { "loginUrl", $"{_appSecrets.RequestOrigin}/login" },
                            { "groupUrl", $"{_appSecrets.RequestOrigin}/group/{group.Identifier}" },
                            { "unsubscribeUrl", $"{_appSecrets.RequestOrigin}/settings" }
                        };

                        _emailQueue.QueueEmail(async (sp) =>
                        {
                            var emailService = sp.GetRequiredService<IEmailTemplateService>();

                            await emailService.SendTemplateEmailAsync(
                                EmailTemplateCategory.GroupJoinRequestNotification,
                                group.Owner.Email,
                                variables
                            );
                        });

                        //var subject = $"Approval Required: {user.FirstName} {user.LastName} Wants to Join {group.Name} on CataCap";

                        //var body = @$"
                        //                <p>Hello {group.Name},</p>
                        //                <p>{user.FirstName} {user.LastName} just asked to join {group.Name}, so please accept or reject their request at your earliest convenience.</p>
                        //                <p style='margin-bottom: 0px;'>Your steps:</p>
                        //                <ol>
                        //                    <li><a href='{requestOrigin}/login' target='_blank'>Log in </a> to Catacap</li>
                        //                    <li>Navigate to My CataCap</li>
                        //                    <li>Navigate to Community</li>
                        //                    <li>Navigate to Request</li>
                        //                    <li>Approve the request</li>
                        //                </ol>
                        //                <p>And remember, you can always <a href='{requestOrigin}/group/{group.Identifier}' target='_blank'>invite others</a> to join as well.</p>
                        //                <p>We appreciate your active role in building a better world!</p>
                        //                <p style='margin-bottom: 0px;'>The CataCap Team</p>
                        //                <p style='margin-top: 0px;'><a href='{requestOrigin}/settings' target='_blank'>Unsubscribe</a> to CataCap notifications.</p>
                        //            ";

                        //_ = _mailService.SendMailAsync(group.Owner.Email, subject, "", body);
                    }
                }

                if (isAcceptWithoupRequest)
                    data.Status = "accepted";
                else
                    data.Status = "pending";

                _context.Requests.Add(data);
                await _context.SaveChangesAsync();

                return Ok();
            }
            return BadRequest();
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> Update_Request(int id, [FromBody] FollowingRequestDto followingRequest)
        {
            var data = await _context.Requests.Include(item => item.RequestOwner)
                .Include(item => item.UserToFollow)
                .Include(item => item.GroupToFollow)
                .SingleOrDefaultAsync(item => item.Id == id);

            if (data != null)
            {
                data.Status = followingRequest.Status;
                await _context.SaveChangesAsync();
                return Ok();
            }
            else
                return BadRequest();
        }

        [HttpDelete]
        public async Task<IActionResult> Delete_Request([FromBody] DeleteRequestDto deleteData)
        {
            User? userData = null;
            User? followingUser = null;

            if (deleteData.IsFromRequest)
            {
                userData = await _repository.UserAuthentication.GetUserById(deleteData.FollowedUserId!);
                followingUser = await _repository.UserAuthentication.GetUser(deleteData.RequestOwnerToken);
            }
            else
            {
                userData = await _repository.UserAuthentication.GetUser(deleteData.RequestOwnerToken);

                followingUser = deleteData.FollowedUserId != null
                                ? await _repository.UserAuthentication.GetUserById(deleteData.FollowedUserId)
                                : null;
            }

            if (userData == null)
            {
                return BadRequest();
            }

            var followingGroup = deleteData.FollowedGroupId != null
                                 ? await _context.Groups.FirstOrDefaultAsync(x => x.Id == deleteData.FollowedGroupId)
                                 : null;

            if (followingUser == null && followingGroup == null)
            {
                return BadRequest();
            }

            var data = await _context.Requests
                            .Where(item => item.RequestOwner != null && item.RequestOwner.Id == userData.Id)
                            .ToListAsync();

            if (followingUser != null)
            {
                data = data.Where(item => item.UserToFollow != null && item.UserToFollow.Id == followingUser.Id).ToList();
            }
            else if (followingGroup != null)
            {
                data = data.Where(item => item.GroupToFollow != null && item.GroupToFollow.Id == followingGroup.Id).ToList();
            }

            if (data != null)
            {
                _context.Requests.RemoveRange(data);
                await _context.SaveChangesAsync();
                return Ok();
            }

            return BadRequest();
        }

        [HttpDelete(("{id}"))]
        public async Task<IActionResult> Delete_Groups_Request(int id, bool deleteUser = false)
        {
            await using var transaction = await _context.Database.BeginTransactionAsync();

            var request = await _context.Requests.Include(item => item.RequestOwner)
                                                    .Include(item => item.UserToFollow)
                                                    .Include(item => item.GroupToFollow)
                                                    .SingleOrDefaultAsync(item => item.Id == id);

            var user = request?.RequestOwner;
            var group = request?.GroupToFollow;

            if (request != null)
            {
                _context.Requests.Remove(request);
                await _context.SaveChangesAsync();
            }

            var groupAccountBalance = await _context.GroupAccountBalance
                                            .FirstOrDefaultAsync(gab => gab.Group.Id == group!.Id && gab.User.Id == user!.Id);

            if (groupAccountBalance != null)
            {
                _context.GroupAccountBalance.Remove(groupAccountBalance);
                await _context.SaveChangesAsync();
            }

            if (deleteUser && user != null)
            {
                _context.Users.Remove(user);
                await _context.SaveChangesAsync();
            }

            await transaction.CommitAsync();

            return Ok();
        }

        [HttpGet("export/{groupId}")]
        public async Task<IActionResult> ExportGroupMembers(int groupId)
        {
            var userData = await _context.Requests.Where(x => x.GroupToFollow != null 
                                                                && x.GroupToFollow.Id == groupId 
                                                                && x.Status == "accepted")
                                                    .Select(x => x.RequestOwner)
                                                    .OrderByDescending(x => x!.DateCreated)
                                                    .ToListAsync();

            if (userData == null || userData.Count == 0)
                return Ok(new { Success = false, Message = "This group doesn't have any member yet." });

            string contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            string fileName = "Group_members.xlsx";

            bool isCorporateGroup = await _context.Groups.AnyAsync(x => x.Id == groupId && x.IsCorporateGroup);

            using (var workbook = new XLWorkbook())
            {
                IXLWorksheet worksheet = workbook.Worksheets.Add("Group_members");

                int col = 1;
                worksheet.Cell(1, col++).Value = "First Name";
                worksheet.Cell(1, col++).Value = "Last Name";
                worksheet.Cell(1, col++).Value = "Email";

                if (isCorporateGroup)
                {
                    worksheet.Cell(1, col++).Value = "Group Balance";
                }

                var headerRow = worksheet.Row(1);
                headerRow.Style.Font.Bold = true;
                worksheet.Columns().Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Left;

                for (int index = 0; index < userData.Count; index++)
                {
                    var dto = userData[index];
                    int row = index + 2;
                    int dataCol = 1;

                    worksheet.Cell(row, dataCol++).Value = dto?.FirstName;
                    worksheet.Cell(row, dataCol++).Value = dto?.LastName;
                    worksheet.Cell(row, dataCol++).Value = dto?.Email;

                    if (isCorporateGroup)
                    {
                        var groupAccountBalance = await _context.GroupAccountBalance
                                                                .Where(gab => gab.Group.Id == groupId 
                                                                        && gab.User.Id == dto!.Id)
                                                                .Select(gab => gab.Balance)
                                                                .FirstOrDefaultAsync();

                        var groupBalanceCell = worksheet.Cell(row, dataCol++);
                        groupBalanceCell.Value = groupAccountBalance;
                        groupBalanceCell.Style.NumberFormat.Format = "$#,##0.00";
                    }
                }

                worksheet.Columns().AdjustToContents();

                foreach (var column in worksheet.Columns())
                {
                    column.Width += 5;
                }

                using (var stream = new MemoryStream())
                {
                    workbook.SaveAs(stream);
                    var content = stream.ToArray();
                    return File(content, contentType, fileName);
                }
            }
        }
    }
}