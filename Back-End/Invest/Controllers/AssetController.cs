using AutoMapper;
using ClosedXML.Excel;
using Invest.Core.Constants;
using Invest.Core.Dtos;
using Invest.Core.Models;
using Invest.Core.Settings;
using Invest.Repo.Data;
using Invest.Service.Interfaces;
using Invest.Service.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Stripe.V2;
using System.Globalization;
using System.Security.Claims;

namespace Invest.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class AssetController : ControllerBase
    {
        private readonly RepositoryContext _context;
        private readonly AppSecrets _appSecrets;
        private readonly IRepositoryManager _repositoryManager;
        private readonly IHttpContextAccessor _httpContextAccessors;
        private readonly IMailService _mailService;
        private readonly IMapper _mapper;
        private readonly HttpClient _httpClient;
        private readonly EmailQueue _emailQueue;
        private readonly ImageService _imageService;

        public AssetController(RepositoryContext context, AppSecrets appSecrets, IRepositoryManager repositoryManager, IMailService mailService, IMapper mapper, IHttpContextAccessor httpContextAccessors, HttpClient httpClient, EmailQueue emailQueue, ImageService imageService)
        {
            _context = context;
            _appSecrets = appSecrets;
            _repositoryManager = repositoryManager;
            _mailService = mailService;
            _mapper = mapper;
            _httpContextAccessors = httpContextAccessors;
            _httpClient = httpClient;
            _emailQueue = emailQueue;
            _imageService = imageService;
        }

        [HttpGet("types")]
        public async Task<IActionResult> AssetTypes()
        {
            return Ok(await _context.AssetType.OrderBy(x => x.Id).ToListAsync());
        }

        [HttpGet("payment-request")]
        public async Task<IActionResult> AssetPayment([FromQuery] PaginationDto dto)
        {
            if (dto == null)
                return BadRequest(new { Success = false, Message = "Invalid request data." });

            bool isAsc = dto?.SortDirection?.ToLower() == "asc";
            var statusList = dto?.Status?.Split(',', StringSplitOptions.RemoveEmptyEntries)
                                            .Select(s => s.Trim().ToLower())
                                            .ToList();

            var query = _context.AssetBasedPaymentRequest
                                .AsNoTracking()
                                .Where(i => statusList == null || statusList.Count == 0 ||
                                        (statusList.Contains("pending")
                                            ? (string.IsNullOrEmpty(i.Status) && statusList.Contains("pending")) ||
                                                (!string.IsNullOrEmpty(i.Status) && statusList.Contains(i.Status.ToLower()))
                                            : (!string.IsNullOrEmpty(i.Status) && statusList.Contains(i.Status.ToLower()))
                                        )
                                )
                                .Select(i => new AssetBasedPaymentResponseDto
                                {
                                    Id = i.Id,
                                    Name = i.User.FirstName + " " + i.User.LastName,
                                    Email = i.User.Email,
                                    InvestmentName = !string.IsNullOrWhiteSpace(i.Campaign!.Name)
                                                        ? i.Campaign.Name
                                                        : null,
                                    AssetType = !string.IsNullOrWhiteSpace(i.AssetDescription)
                                                        ? i.AssetDescription
                                                        : i.AssetType.Type,
                                    ApproximateAmount = i.ApproximateAmount,
                                    ReceivedAmount = i.ReceivedAmount,
                                    ContactMethod = i.ContactMethod,
                                    ContactValue = i.ContactValue,
                                    Status = i.Status,
                                    CreatedAt = i.CreatedAt,
                                    HasNotes = _context.AssetBasedPaymentRequestNotes.Any(n => n.RequestId == i.Id)
                                });

            query = dto?.SortField?.ToLower() switch
            {
                "name" => isAsc
                            ? query.OrderBy(x => x.Name)
                            : query.OrderByDescending(x => x.Name),

                "status" => isAsc
                                ? query.OrderBy(i => i.Status)
                                : query.OrderByDescending(i => i.Status),

                "assettype" => isAsc
                                ? query.OrderBy(i => i.AssetType)
                                : query.OrderByDescending(i => i.AssetType),

                "createdat" => isAsc
                                  ? query.OrderBy(x => x.CreatedAt)
                                  : query.OrderByDescending(x => x.CreatedAt),

                _ => query.OrderByDescending(x => x.Id)
            };

            int page = dto?.CurrentPage ?? 1;
            int pageSize = dto?.PerPage ?? 50;
            int totalCount = await query.CountAsync();

            var items = await query
                        .Skip((page - 1) * pageSize)
                        .Take(pageSize)
                        .ToListAsync();

            if (totalCount > 0)
                return Ok(new { items, totalCount });

            return Ok(new { Success = false, Message = "Data not found." });
        }

        [HttpPost("payment-request")]
        public async Task<IActionResult> AssetPayment([FromBody] AssetBasedPaymentRequestDto dto)
        {
            var allEmailTasks = new List<Task>();
            
            if (dto == null)
                return BadRequest(new { Success = false, Message = "Invalid request data." });

            if (dto.AssetTypeId <= 0)
                return BadRequest(new { Success = false, Message = "Asset Type Id must be greater than 0." });

            if (dto.ApproximateAmount <= 0)
                return BadRequest(new { Success = false, Message = "Approximate Amount must be greater than 0." });

            if (string.IsNullOrWhiteSpace(dto.ContactMethod))
                return BadRequest(new { Success = false, Message = "Contact Method is required." });

            if (string.IsNullOrWhiteSpace(dto.ContactValue))
                return BadRequest(new { Success = false, Message = "Contact Value is required." });

            if (string.IsNullOrWhiteSpace(dto.Status))
                return BadRequest(new { Success = false, Message = "Status is required." });

            if (dto.IsAnonymous)
            {
                if (string.IsNullOrWhiteSpace(dto.FirstName))
                    return BadRequest(new { Success = false, Message = "FirstName is required." });

                if (string.IsNullOrWhiteSpace(dto.LastName))
                    return BadRequest(new { Success = false, Message = "LastName is required." });

                if (string.IsNullOrWhiteSpace(dto.Email))
                    return BadRequest(new { Success = false, Message = "Email is required." });
            }

            bool isAnonymous = dto!.IsAnonymous;
            var requestOrigin = HttpContext?.Request.Headers["Origin"].ToString();

            var user = await GetUser(dto.Email);
            if (isAnonymous)
            {
                var existingEmail = await _context.Users.AnyAsync(u => u.Email.ToLower() == dto.Email!.ToLower().Trim());
                if (existingEmail)
                    return Ok(new { Success = false, Message = $"Email '{dto.Email}' is already taken." });

                user = await RegisterAnonymousUser(dto.FirstName!.Trim(), dto.LastName!.Trim(), dto.Email!.ToLower().Trim());
                // allEmailTasks.Add(SendWelcomeToCataCapEmail(requestOrigin!, dto.Email, user.UserName, user.FirstName!));

                var variables = new Dictionary<string, string>
                {
                    { "firstName", user.FirstName! },
                    { "userName", user.UserName },
                    { "resetPasswordUrl", $"{_appSecrets.RequestOrigin}/forgotpassword" },
                    { "logoUrl", await _imageService.GetImageUrl() },
                    { "siteUrl", _appSecrets.RequestOrigin }
                };

                _emailQueue.QueueEmail(async (sp) =>
                {
                    var emailService = sp.GetRequiredService<IEmailTemplateService>();

                    await emailService.SendTemplateEmailAsync(
                        EmailTemplateCategory.WelcomeAnonymousUser,
                        dto.Email,
                        variables
                    );
                });
            }

            if (user == null)
                return Ok(new { Success = false, Message = "User not found." });

            if (string.IsNullOrWhiteSpace(user.ZipCode))
                user.ZipCode = !string.IsNullOrWhiteSpace(dto.ZipCode) ? dto.ZipCode : null;

            if (!string.IsNullOrEmpty(dto!.Reference) && dto!.Reference.ToLower().Trim() == "champions deals")
                user.IsActive = true;

            AssetBasedPaymentRequest asset = new AssetBasedPaymentRequest
            {
                UserId = user.Id,
                CampaignId = dto.CampaignId,
                AssetTypeId = dto.AssetTypeId,
                AssetDescription = !string.IsNullOrWhiteSpace(dto.AssetDescription) ? dto.AssetDescription.Trim() : null,
                ApproximateAmount = dto.CoverFees ? dto.InvestmentAmountWithFees : dto.ApproximateAmount,
                ReceivedAmount = dto.CoverFees ? dto.ApproximateAmount : (dto.ApproximateAmount - (dto.ApproximateAmount * 0.05m)),
                ContactMethod = dto.ContactMethod,
                ContactValue = dto.ContactValue.Trim(),
                Status = dto.Status,
                Reference = !string.IsNullOrWhiteSpace(dto.Reference) ? dto.Reference : null,
                CreatedAt = DateTime.Now
            };
            await _context.AssetBasedPaymentRequest.AddAsync(asset);

            var result = await _context.SaveChangesAsync();

            if (result <= 0)
                return Ok(new { Success = false, Message = "Payment failed." });

            if (_appSecrets.IsProduction)
            {
                var assetType = await _context.AssetType
                                        .Where(x => x.Id == dto.AssetTypeId)
                                        .Select(x => x.Type)
                                        .FirstOrDefaultAsync();

                var investmentName = dto.CampaignId.HasValue
                                    ? await _context.Campaigns
                                                    .Where(x => x.Id == dto.CampaignId.Value)
                                                    .Select(x => x.Name)
                                                    .FirstOrDefaultAsync()
                                    : string.Empty;

                string formattedAmount = string.Format(CultureInfo.GetCultureInfo("en-US"), "${0:N2}", dto.CoverFees ? dto.InvestmentAmountWithFees : dto.ApproximateAmount);

                string assetTypeSection = !string.IsNullOrWhiteSpace(dto.AssetDescription)
                                            ? $"<p><b>Asset Type: </b>{assetType} ({dto.AssetDescription})</p>"
                                            : $"<p><b>Asset Type: </b>{assetType}</p>";

                string investmentSection = !string.IsNullOrWhiteSpace(investmentName)
                                            ? $"<p><b>Investment Name: </b>{investmentName}</p>"
                                            : "";

                var variables = new Dictionary<string, string>
                {
                    { "logoUrl", await _imageService.GetImageUrl() },
                    { "userFullName", $"{user.FirstName} {user.LastName}" },
                    { "userEmail",  user.Email },
                    { "assetTypeSection", assetTypeSection },
                    { "amount", formattedAmount },
                    { "contactMethod", dto.ContactMethod },
                    { "contactValue", dto.ContactValue },
                    { "investmentSection", investmentSection }
                };

                _emailQueue.QueueEmail(async (sp) =>
                {
                    var emailService = sp.GetRequiredService<IEmailTemplateService>();

                    await emailService.SendTemplateEmailAsync(
                        EmailTemplateCategory.AssetDonationRequest,
                        _appSecrets.CatacapAdminEmail,
                        variables
                    );
                });

                //allEmailTasks.Add(
                //    SendAssetPaymentEmail(
                //        requestOrigin!,
                //        _appSecrets.CatacapAdminEmail,
                //        $"{user.FirstName} {user.LastName}",
                //        user.Email,
                //        assetType ?? "N/A",
                //        dto.AssetDescription,
                //        dto.ContactMethod,
                //        dto.ContactValue,
                //        dto.CoverFees ? dto.InvestmentAmountWithFees : dto.ApproximateAmount,
                //        dto.Status,
                //        investmentName
                //    )
                //);
            }
            _ = Task.WhenAll(allEmailTasks);

            return Ok(new { Success = true, Message = "Payment successful." });
        }

        [HttpPut("payment-request")]
        public async Task<IActionResult> AssetPayment([FromBody] UpdateAssetPaymentDto dto)
        {
            if (dto == null || dto.Id <= 0)
                return BadRequest(new { Success = false, Message = "Invalid request data." });

            var assetPayment = await _context.AssetBasedPaymentRequest
                                                .Include(x => x.Campaign)
                                                .Include(x => x.User)
                                                .Include(x => x.AssetType)
                                                .FirstOrDefaultAsync(x => x.Id == dto.Id);

            if (assetPayment == null)
                return BadRequest(new { Success = false, Message = "Asset payment request not found." });

            var user = assetPayment.User;
            if (user == null)
                return BadRequest(new { Success = false, Message = "Associated user not found." });

            var identity = HttpContext.User.Identity as ClaimsIdentity;
            var loginUserId = identity?.Claims.FirstOrDefault(i => i.Type == "id")?.Value;

            if (string.IsNullOrEmpty(loginUserId))
                return Unauthorized(new { Success = false, Message = "Unauthorized access." });

            var loginUser = await _repositoryManager.UserAuthentication.GetUserById(loginUserId!);

            if (loginUser == null)
                return Unauthorized(new { Success = false, Message = "Logged-in user not found." });

            string oldStatus = assetPayment.Status ?? "Pending";
            string newStatus = dto.Status ?? "Pending";

            if (!string.IsNullOrWhiteSpace(dto.Note))
            {
                await _context.AssetBasedPaymentRequestNotes.AddAsync(new AssetBasedPaymentRequestNotes
                {
                    RequestId = assetPayment.Id,
                    Note = dto.Note.Trim(),
                    OldStatus = oldStatus,
                    NewStatus = newStatus,
                    CreatedBy = loginUserId!,
                    CreatedAt = DateTime.Now
                });
            }

            if (oldStatus == "Pending" && newStatus == "In Transit")
            {
                assetPayment.Status = newStatus;
            }
            else if (oldStatus == "In Transit" && newStatus == "Received")
            {
                assetPayment.ReceivedAmount = dto.Amount > 0 ? dto.Amount : assetPayment.ReceivedAmount;

                var paymentType = !string.IsNullOrWhiteSpace(assetPayment.AssetDescription)
                                    ? $"{assetPayment.AssetDescription}, {loginUser.UserName.Trim().ToLower()}"
                                    : $"{assetPayment.AssetType.Type}, {loginUser.UserName.Trim().ToLower()}";

                var isSuccess = await UpdateAccountBalance(user, assetPayment.ReceivedAmount, paymentType, assetPayment.Id, assetPayment.Reference);

                if (!isSuccess)
                    return BadRequest(new { Success = false, Message = "Failed to update account balance." });

                if (assetPayment.CampaignId.HasValue)
                {
                    await new RecommendationsController(
                        _context,
                        _repositoryManager,
                        _mapper,
                        _mailService,
                        _httpContextAccessors,
                        _emailQueue,
                        _imageService,
                        _appSecrets)
                        .CreateRecommendation(new AddRecommendationDto
                        {
                            Amount = user.AccountBalance,
                            Campaign = assetPayment.Campaign,
                            User = assetPayment.User,
                            UserEmail = assetPayment.User.Email,
                            UserFullName = $"{user.FirstName} {user.LastName}"
                        });

                    await _context.UserInvestments.AddAsync(new UserInvestments
                    {
                        UserId = user.Id,
                        PaymentType = paymentType,
                        CampaignName = assetPayment.Campaign!.Name,
                        CampaignId = assetPayment.Campaign!.Id,
                        LogTriggered = true
                    });
                }
                assetPayment.Status = newStatus;
                user.IsFreeUser = false;
                user.IsActive = true;
            }
            else if ((oldStatus == "Pending" || oldStatus == "In Transit") && newStatus == "Rejected")
            {
                assetPayment.Status = newStatus;
            }

            var affectedRows = await _context.SaveChangesAsync();

            if (affectedRows <= 0)
                return BadRequest(new { Success = false, Message = "No changes were saved." });

            return Ok(new { Success = true, Message = "Asset payment status updated successfully." });
        }

        [HttpGet("notes")]
        public async Task<IActionResult> AssetPaymentNotes(int assetPaymentId)
        {
            if (assetPaymentId <= 0)
                return Ok(new { Success = false, Message = "Invalid asset payment id" });

            var notes = await _context.AssetBasedPaymentRequestNotes
                                        .Where(x => x.RequestId == assetPaymentId)
                                        .Select(x => new
                                        {
                                            x.Id,
                                            x.OldStatus,
                                            x.NewStatus,
                                            x.Note,
                                            x.User!.UserName,
                                            x.CreatedAt
                                        })
                                        .OrderByDescending(x => x.Id)
                                        .ToListAsync();

            return Ok(notes);
        }

        [HttpGet("export")]
        public async Task<IActionResult> Export()
        {
            var data = await _context.AssetBasedPaymentRequest
                                     .Include(x => x.User)
                                     .Include(x => x.Campaign)
                                     .Include(x => x.AssetType)
                                     .ToListAsync();

            string contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            string fileName = "AssetPaymentRequests.xlsx";

            using (var workbook = new XLWorkbook())
            {
                IXLWorksheet worksheet = workbook.Worksheets.Add("AssetPaymentRequests");

                var headers = new[]
                {
                    "Name", "Email", "Investment Name", "Asset Type", "Approximate Amount", "Received Amount", "Contact Method",
                    "Contact Value", "Status", "Date Created"
                };

                for (int col = 0; col < headers.Length; col++)
                {
                    worksheet.Cell(1, col + 1).Value = headers[col];
                }

                var headerRow = worksheet.Row(1);
                headerRow.Style.Font.Bold = true;

                worksheet.Columns().Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Left;

                for (int index = 0; index < data.Count; index++)
                {
                    var dto = data[index];
                    int row = index + 2;
                    int col = 1;

                    worksheet.Cell(row, col++).Value = dto.User.FirstName + " " + dto.User.LastName;
                    worksheet.Cell(row, col++).Value = dto.User.Email;
                    worksheet.Cell(row, col++).Value = dto.Campaign?.Name;
                    worksheet.Cell(row, col++).Value = !string.IsNullOrWhiteSpace(dto.AssetDescription) ? dto.AssetDescription : dto.AssetType.Type;

                    var approximateAmountCell = worksheet.Cell(row, col++);
                    approximateAmountCell.Value = $"${Convert.ToDecimal(dto.ApproximateAmount):N2}";
                    approximateAmountCell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right;

                    var receivedAmountCell = worksheet.Cell(row, col++);
                    receivedAmountCell.Value = $"${Convert.ToDecimal(dto.ReceivedAmount):N2}";
                    receivedAmountCell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right;

                    worksheet.Cell(row, col++).Value = dto.ContactMethod;
                    worksheet.Cell(row, col++).Value = dto.ContactValue;
                    worksheet.Cell(row, col++).Value = dto.Status;
                    worksheet.Cell(row, col++).Value = dto.CreatedAt.ToString("MM-dd-yyyy HH:mm");
                }
                worksheet.Columns().AdjustToContents();

                foreach (var column in worksheet.Columns())
                {
                    column.Width += 10;
                }

                using (var stream = new MemoryStream())
                {
                    workbook.SaveAs(stream);
                    return File(stream.ToArray(), contentType, fileName);
                }
            }
        }

        private async Task<User> RegisterAnonymousUser(string firstName, string lastName, string email)
        {
            var userName = $"{firstName}{lastName}".Replace(" ", "").Trim().ToLower();
            Random random = new Random();
            while (_context.Users.Any(x => x.UserName == userName))
            {
                userName = $"{firstName}{lastName}{random.Next(0, 100)}".ToLower();
            }

            UserRegistrationDto registrationDto = new UserRegistrationDto()
            {
                FirstName = firstName,
                LastName = lastName,
                UserName = userName,
                Password = _appSecrets.DefaultPassword,
                Email = email
            };

            await _repositoryManager.UserAuthentication.RegisterUserAsync(registrationDto, UserRoles.User);

            var user = await _repositoryManager.UserAuthentication.GetUserByUserName(userName);
            user.IsFreeUser = true;
            user.IsActive = true;
            await _repositoryManager.UserAuthentication.UpdateUser(user);
            await _repositoryManager.SaveAsync();

            return user;
        }

        private async Task<bool> UpdateAccountBalance(User user, decimal amount, string paymentType, int assetPaymentId, string? reference)
        {
            var accountBalanceLog = new AccountBalanceChangeLog
            {
                UserId = user.Id,
                PaymentType = paymentType,
                OldValue = user.AccountBalance,
                NewValue = user.AccountBalance + amount,
                UserName = user.UserName,
                AssetBasedPaymentRequestId = assetPaymentId,
                Reference = reference
            };
            await _context.AccountBalanceChangeLogs.AddAsync(accountBalanceLog);

            user.AccountBalance = accountBalanceLog.NewValue;

            var affectedRows = await _context.SaveChangesAsync();

            return affectedRows > 0;
        }

        private async Task<User?> GetUser(string? email)
        {
            if (!string.IsNullOrEmpty(email))
                return await _repositoryManager.UserAuthentication.GetUserByEmail(email.ToLower().Trim());

            var identity = HttpContext?.User?.Identity as ClaimsIdentity;
            if (identity == null)
                return null;

            var userId = identity.Claims.FirstOrDefault(c => c.Type == ClaimTypes.NameIdentifier || c.Type == "id")?.Value;
            if (string.IsNullOrEmpty(userId))
                return null;

            return await _repositoryManager.UserAuthentication.GetUserById(userId);
        }

        private async Task SendWelcomeToCataCapEmail(string requestOrigin, string emailTo, string userName, string firstName)
        {
            string logoUrl = $"{requestOrigin}/logo-for-email.png";
            string logoHtml = $@"
                                <div style='text-align: center;'>
                                    <a href='https://catacap.org' target='_blank'>
                                        <img src='{logoUrl}' alt='CataCap Logo' width='300' height='150' />
                                    </a>
                                </div>";

            string resetPasswordUrl = $"{requestOrigin}/forgotpassword";
            string userSettingsUrl = $"{requestOrigin}/settings";
            string subject = "Welcome to CataCap - Let’s Move Capital That Matters 💥";

            var body = logoHtml + $@"
                                    <html>
                                        <body>
                                            <p><b>Hi {firstName},</b></p>
                                            <p>Welcome to <b>CataCap</b> - the movement turning philanthropic dollars into <b>powerful, catalytic investments</b> that fuel real change.</p>
                                            <p>You’ve just joined what we believe will become the <b>largest community of catalytic capital champions</b> on the planet. Whether you're a donor, funder, or impact-curious investor - you're in the right place.</p>
                                            <p>Your CataCap username: <b>{userName}</b></p>
                                            <p>To set your password: <a href='{resetPasswordUrl}' target='_blank'>Click here</a></p>
                                            <p>Here’s what you can do right now on CataCap:</p>
                                            <p>🔎 <b>1. Discover Investments Aligned with Your Values</b></p>
                                            <p style='margin-bottom: 0px;'>Use your <b>DAF, foundation, or donation capital</b> to fund vetted companies, VC funds, and loan structures — not just nonprofits.</p>
                                            <p style='margin-top: 0px;'>➡️ <a href='{requestOrigin}/find'>Browse live investment opportunities</a></p>
                                            <p>🤝 <b>2. Connect with Like-Minded Peers</b></p>
                                            <p style='margin-bottom: 0px;'>Follow friends and colleagues, share opportunities, or keep your giving private — you’re in control.</p>
                                            <p style='margin-top: 0px;'>➡️ <a href='{requestOrigin}/community'>Explore the CataCap community</a></p>
                                            <p>🗣️ <b>3. Join or Start a Group</b></p>
                                            <p style='margin-bottom: 0px;'>Find (or create!) groups around shared causes and funding themes — amplify what matters to you.</p>
                                            <p style='margin-top: 0px;'>➡️ <a href='{requestOrigin}/community'>See active groups and start your own</a></p>
                                            <p>🚀 <b>4. Recommend Deals You Believe In</b></p>
                                            <p style='margin-bottom: 0px;'>Champion investments that should be seen — and funded — by others in the community.</p>
                                            <p style='margin-top: 0px;'>➡️ <a href='https://catacap.org/lead-investor/'>Propose an opportunity</a></p>
                                            <p>We’re here to help you put your capital to work — boldly, effectively, and in community.</p>
                                            <p>Thanks for joining us. Let’s fund what we wish existed — together.</p>
                                            <p style='margin-bottom: 0px;'><b>The CataCap Team</b></p>
                                            <p style='margin-top: 0px;'>🌍 <a href='https://catacap.org/'>catacap.org</a> | 💼 <a href='https://www.linkedin.com/company/catacap-us/'>Follow us on LinkedIn</a></p>
                                            <p>Have questions? Email Ken at <a href='mailto:ken@impactree.org'>ken@impactree.org</a></p>
                                            <p><a href='{requestOrigin}/settings' target='_blank'>Unsubscribe</a> from CataCap notifications.</p>
                                        </body>
                                    </html>";

            await _mailService.SendMailAsync(emailTo, subject, "", body);
        }

        private async Task SendAssetPaymentEmail(string requestOrigin, string emailTo, string userFullName, string userEmail, string assetType, string? assetDescription, string contactMethod, string contactValue, decimal amount, string status, string? investmentName)
        {
            string formattedAmount = string.Format(System.Globalization.CultureInfo.GetCultureInfo("en-US"), "${0:N2}", amount);
            string formattedDate = DateTime.Now.ToString("MM/dd/yyyy");
            string subject = "New Other Asset Payment Request";

            string logoUrl = $"{requestOrigin}/logo-for-email.png";
            string logoHtml = $@"
                                <div style='text-align: center;'>
                                    <a href='https://catacap.org' target='_blank'>
                                        <img src='{logoUrl}' alt='CataCap Logo' width='300' height='150' />
                                    </a>
                                </div>";

            string investmentScenarios = !string.IsNullOrWhiteSpace(investmentName)
                                            ? $@"<p><b>Investment Name: </b>{investmentName}</p>"
                                            : "";
            string assetTypeScenarios = !string.IsNullOrWhiteSpace(assetDescription)
                                            ? $@"<p><b>Asset Type: </b>{assetType} ({assetDescription})</p>"
                                            : $@"<p><b>Asset Type: </b>{assetType}</p>";

            var template = logoHtml + $@"
                                    <html>
                                        <body>
                                            <p><b>Name: </b>{userFullName}</p>
                                            <p><b>Email: </b>{userEmail}</p>
                                            {assetTypeScenarios}
                                            <p><b>Amount: </b>{formattedAmount}</p>
                                            <p><b>Contact Method: </b>{contactMethod}</p>
                                            <p><b>Contact Value: </b>{contactValue}</p>
                                            {investmentScenarios}
                                        </body>
                                    </html>";

            await _mailService.SendMailAsync(emailTo, subject, "", template);
        }
    }
}
