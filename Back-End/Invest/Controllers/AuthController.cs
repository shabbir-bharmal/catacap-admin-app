// Ignore Spelling: Auth Admin Captcha

using AutoMapper;
using Invest.Core.Constants;
using Invest.Core.Dtos;
using Invest.Core.Models;
using Invest.Core.Settings;
using Invest.Repo.Data;
using Invest.Service.Filters.ActionFilters;
using Invest.Service.Interfaces;
using Invest.Service.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace Invest.Controllers;


[Route("api/userauthentication")]
[ApiController]
public class AuthController : BaseApiController
{
    private readonly RepositoryContext _context;
    private readonly AppSecrets _appSecrets;
    private readonly HttpClient _httpClient;
    private readonly RoleManager<ApplicationRole> _roleManager;
    private readonly UserManager<User> _userManager;
    private readonly EmailQueue _emailQueue;
    private readonly ImageService _imageService;

    public AuthController(RepositoryContext context, IRepositoryManager repository, ILoggerManager logger, IMapper mapper, AppSecrets appSecrets, HttpClient httpClient, RoleManager<ApplicationRole> roleManager, UserManager<User> userManager, EmailQueue emailQueue, ImageService imageService) : base(repository, logger, mapper)
    {
        _context = context;
        _appSecrets = appSecrets;
        _httpClient = httpClient;
        _roleManager = roleManager;
        _userManager = userManager;
        _emailQueue = emailQueue;
        _imageService = imageService;
    }

    [AllowAnonymous]
    [HttpPost("import")]
    [ServiceFilter(typeof(ValidationFilterAttribute))]
    public async Task<IActionResult> ImportUsers([FromBody] UsersImportDto usersImport)
    {
        bool userAdded = false;
        var results = new List<object>();
        var random = new Random();

        var groupToFollow = await _context.Groups.FirstOrDefaultAsync(i => i.Id == usersImport.groupId);
        if (groupToFollow == null)
        {
            return BadRequest("Invalid group id");
        }

        foreach (var user in usersImport.users)
        {
            var existingUserName = await _context.Users.Where(x => x.Email == user.Email).Select(x => x.UserName).FirstOrDefaultAsync();
            var existingUser = await _context.Users.FirstOrDefaultAsync(x => x.Email == user.Email && x.UserName == existingUserName);

            if (existingUser != null)
            {
                bool alreadyFollowing = await _context.Requests.AnyAsync(r => r.RequestOwner != null
                                                                                && r.GroupToFollow != null
                                                                                && r.RequestOwner.Id == existingUser.Id
                                                                                && r.GroupToFollow.Id == groupToFollow.Id);

                if (alreadyFollowing)
                {
                    results.Add(new { success = true });
                    continue;
                }

                await AddUserToGroup(existingUser, groupToFollow);

                existingUser.IsActive = true;

                if (groupToFollow.IsCorporateGroup)
                {
                    existingUser.IsFreeUser = false;
                }
                await _repository.UserAuthentication.UpdateUser(existingUser);

                userAdded = true;
                results.Add(new { success = true });
                continue;
            }

            string userName = user.UserName!;
            bool existsUserName = await _context.Users.AnyAsync(x => x.UserName == userName);
            while (existsUserName)
            {
                int randomTwoDigit = random.Next(0, 100);
                string newUserName = $"{userName}{randomTwoDigit}";

                existsUserName = await _context.Users.AnyAsync(x => x.UserName == newUserName);
                if (!existsUserName)
                {
                    userName = newUserName;
                }
            }

            var registrationDto = new UserRegistrationDto
            {
                UserName = userName,
                Password = user.Password,
                Email = user.Email,
                FirstName = user.FirstName,
                LastName = user.LastName,
                IsAnonymous = user.IsAnonymous
            };
            var registrationResult = await _repository.UserAuthentication.RegisterUserAsync(registrationDto, UserRoles.User);

            if (!registrationResult.Succeeded)
            {
                results.Add(new { success = false, errors = registrationResult.Errors });
                continue;
            }

            var createdUser = await _repository.UserAuthentication.GetUserByUserName(userName);
            await AddUserToGroup(createdUser, groupToFollow);

            createdUser.IsActive = true;

            if (groupToFollow.IsCorporateGroup)
                createdUser.IsFreeUser = false;
            else
                createdUser.IsFreeUser = true;

            await _repository.UserAuthentication.UpdateUser(createdUser);
            userAdded = true;
            results.Add(new { success = true });
        }

        if (userAdded)
        {
            var requests = await _context.Requests.Include(i => i.RequestOwner).Include(i => i.GroupToFollow).Where(item => item.GroupToFollow != null && item.GroupToFollow.Id == usersImport.groupId).Where(item => item.Status == "accepted").ToListAsync();
            var members = _mapper.Map<List<FollowingRequest>, List<FollowingRequestDto>>(requests);

            return Ok(new { results, members });
        }

        return Ok(new { results });
    }

    private async Task AddUserToGroup(User user, Group group)
    {
        var request = new FollowingRequest
        {
            RequestOwner = user,
            GroupToFollow = group,
            Status = "accepted"
        };
        await _context.Requests.AddAsync(request);

        var groupBalance = new GroupAccountBalance
        {
            User = user,
            Group = group,
            Balance = 0
        };
        await _context.GroupAccountBalance.AddAsync(groupBalance);
        await _context.SaveChangesAsync();
    }

    [AllowAnonymous]
    [HttpPost("register")]
    [ServiceFilter(typeof(ValidationFilterAttribute))]
    public async Task<IActionResult> RegisterUser([FromBody] UserRegistrationDto userRegistration)
    {
        if (!string.IsNullOrEmpty(userRegistration.CaptchaToken))
        {
            if (!await VerifyCaptcha(userRegistration.CaptchaToken))
                return BadRequest("CAPTCHA verification failed.");
        }

        var requestOrigin = HttpContext?.Request.Headers["Origin"].ToString();

        var userResult = await _repository.UserAuthentication.RegisterUserAsync(userRegistration, UserRoles.User);
        if (!userResult.Succeeded)
        {
            bool hasDuplicateUserName = userResult.Errors.Any(e => e.Code == "DuplicateUserName");

            if (userRegistration.IsAnonymous && hasDuplicateUserName)
            {
                var userName = userRegistration?.UserName?.ToLower();
                bool existsUserName = _context.Users.Any(x => x.UserName.ToLower() == userName);
                Random random = new Random();

                while (existsUserName)
                {
                    int randomTwoDigit = random.Next(0, 100);
                    string newUserName = $"{userName}{randomTwoDigit}";

                    existsUserName = _context.Users.Any(x => x.UserName == newUserName);

                    if (!existsUserName)
                    {
                        userName = newUserName;
                    }
                }

                var updatedUserRegistration = new UserRegistrationDto
                {
                    UserName = userName,
                    Password = userRegistration!.Password,
                    Email = userRegistration.Email,
                    FirstName = userRegistration.FirstName,
                    LastName = userRegistration.LastName,
                    IsAnonymous = userRegistration.IsAnonymous
                };

                userResult = await _repository.UserAuthentication.RegisterUserAsync(updatedUserRegistration, UserRoles.User);
            }
            if (!userResult.Succeeded)
            {
                return Ok(new { success = false, errors = userResult.Errors });
            }
        }

        var user = await _context.Users.Where(x => x.Email == userRegistration.Email).FirstOrDefaultAsync();
        user!.IsActive = true;
        user.IsFreeUser = true;
        await _repository.UserAuthentication.UpdateUser(user);
        
        UserLoginDto userLoginDto = new();
        userLoginDto.Email = userRegistration.Email;
        userLoginDto.Password = userRegistration.Password;
        await _repository.UserAuthentication.ValidateUserAsync(userLoginDto);

        var variables = new Dictionary<string, string>
        {
            { "firstName", userRegistration.FirstName! },
            { "userName", userRegistration.UserName! },
            { "resetPasswordUrl", $"{_appSecrets.RequestOrigin}/forgotpassword" },
            { "logoUrl", await _imageService.GetImageUrl() },
            { "siteUrl", _appSecrets.RequestOrigin }
        };

        _emailQueue.QueueEmail(async (sp) =>
        {
            var emailService = sp.GetRequiredService<IEmailTemplateService>();

            await emailService.SendTemplateEmailAsync(
                userRegistration.IsAnonymous
                    ? EmailTemplateCategory.WelcomeAnonymousUser
                    : EmailTemplateCategory.WelcomeRegisteredUser,
                user.Email,
                variables
            );
        });

        //_ = Task.Run(async () =>
        //{
        //    string subject = "Welcome to CataCap - Let’s Move Capital That Matters 💥";
        //    string logoUrl = $"{requestOrigin}/logo-for-email.png";
        //    string logoHtml = $@"
        //                        <div style='text-align: center;'>
        //                            <a href='https://catacap.org' target='_blank'>
        //                                <img src='{logoUrl}' alt='CataCap Logo' width='300' height='150' />
        //                            </a>
        //                        </div>";

        //    if (userRegistration.IsAnonymous)
        //    {
        //        string resetPasswordUrl = $"{requestOrigin}/forgotpassword";
        //        string userSettingsUrl = $"{requestOrigin}/settings";

        //        var template = logoHtml + $@"
        //                                        <html>
        //                                            <body>
        //                                                <p><b>Hi {userRegistration.FirstName},</b></p>
        //                                                <p>Welcome to <b>CataCap</b> - the movement turning philanthropic dollars into <b>powerful, catalytic investments</b> that fuel real change.</p>
        //                                                <p>You’ve just joined what we believe will become the <b>largest community of catalytic capital champions</b> on the planet. Whether you're a donor, funder, or impact-curious investor - you're in the right place.</p>
        //                                                <p>Your CataCap username: <b>{userRegistration.UserName}</b></p>
        //                                                <p>To set your password: <a href='{resetPasswordUrl}' target='_blank'>Click here</a></p>
        //                                                <p>Here’s what you can do right now on CataCap:</p>
        //                                                <p>🔎 <b>1. Discover Investments Aligned with Your Values</b></p>
        //                                                <p style='margin-bottom: 0px;'>Use your <b>DAF, foundation, or donation capital</b> to fund vetted companies, VC funds, and loan structures — not just nonprofits.</p>
        //                                                <p style='margin-top: 0px;'>➡️ <a href='{requestOrigin}/find'>Browse live investment opportunities</a></p>
        //                                                <p>🤝 <b>2. Connect with Like-Minded Peers</b></p>
        //                                                <p style='margin-bottom: 0px;'>Follow friends and colleagues, share opportunities, or keep your giving private — you’re in control.</p>
        //                                                <p style='margin-top: 0px;'>➡️ <a href='{requestOrigin}/community'>Explore the CataCap community</a></p>
        //                                                <p>🗣️ <b>3. Join or Start a Group</b></p>
        //                                                <p style='margin-bottom: 0px;'>Find (or create!) groups around shared causes and funding themes — amplify what matters to you.</p>
        //                                                <p style='margin-top: 0px;'>➡️ <a href='{requestOrigin}/community'>See active groups and start your own</a></p>
        //                                                <p>🚀 <b>4. Recommend Deals You Believe In</b></p>
        //                                                <p style='margin-bottom: 0px;'>Champion investments that should be seen — and funded — by others in the community.</p>
        //                                                <p style='margin-top: 0px;'>➡️ <a href='https://catacap.org/lead-investor/'>Propose an opportunity</a></p>
        //                                                <p>We’re here to help you put your capital to work — boldly, effectively, and in community.</p>
        //                                                <p>Thanks for joining us. Let’s fund what we wish existed — together.</p>
        //                                                <p style='margin-bottom: 0px;'><b>The CataCap Team</b></p>
        //                                                <p style='margin-top: 0px;'>🌍 <a href='https://catacap.org/'>catacap.org</a> | 💼 <a href='https://www.linkedin.com/company/catacap-us/'>Follow us on LinkedIn</a></p>
        //                                                <p>Have questions? Email Ken at <a href='mailto:ken@impactree.org'>ken@impactree.org</a></p>
        //                                                <p><a href='{requestOrigin}/settings' target='_blank'>Unsubscribe</a> from CataCap notifications.</p>
        //                                            </body>
        //                                        </html>";

        //        allEmailTasks.Add(_mailService.SendMailAsync(user.Email, subject, "", template));
        //    }
        //    else
        //    {
        //        var body = logoHtml + $@"
        //                        <html>
        //                            <body>
        //                                <p><b>Hi {userRegistration.FirstName},</b></p>
        //                                <p>Welcome to <b>CataCap</b> - the movement turning philanthropic dollars into <b>powerful, catalytic investments</b> that fuel real change.</p>
        //                                <p>You’ve just joined what we believe will become the <b>largest community of catalytic capital champions</b> on the planet. Whether you're a donor, funder, or impact-curious investor - you're in the right place.</p>
        //                                <p>Here’s what you can do right now on CataCap:</p>
        //                                <p>🔎 <b>1. Discover Investments Aligned with Your Values</b></p>
        //                                <p style='margin-bottom: 0px;'>Use your <b>DAF, foundation, or donation capital</b> to fund vetted companies, VC funds, and loan structures — not just nonprofits.</p>
        //                                <p style='margin-top: 0px;'>➡️ <a href='{requestOrigin}/find'>Browse live investment opportunities</a></p>
        //                                <p>🤝 <b>2. Connect with Like-Minded Peers</b></p>
        //                                <p style='margin-bottom: 0px;'>Follow friends and colleagues, share opportunities, or keep your giving private — you’re in control.</p>
        //                                <p style='margin-top: 0px;'>➡️ <a href='{requestOrigin}/community'>Explore the CataCap community</a></p>
        //                                <p>🗣️ <b>3. Join or Start a Group</b></p>
        //                                <p style='margin-bottom: 0px;'>Find (or create!) groups around shared causes and funding themes — amplify what matters to you.</p>
        //                                <p style='margin-top: 0px;'>➡️ <a href='{requestOrigin}/community'>See active groups and start your own</a></p>
        //                                <p>🚀 <b>4. Recommend Deals You Believe In</b></p>
        //                                <p style='margin-bottom: 0px;'>Champion investments that should be seen — and funded — by others in the community.</p>
        //                                <p style='margin-top: 0px;'>➡️ <a href='https://catacap.org/lead-investor/'>Propose an opportunity</a></p>
        //                                <p>We’re here to help you put your capital to work — boldly, effectively, and in community.</p>
        //                                <p>Thanks for joining us. Let’s fund what we wish existed — together.</p>
        //                                <p style='margin-bottom: 0px;'><b>The CataCap Team</b></p>
        //                                <p style='margin-top: 0px;'>🌍 <a href='https://catacap.org/'>catacap.org</a> | 💼 <a href='https://www.linkedin.com/company/catacap-us/'>Follow us on LinkedIn</a></p>
        //                                <p>Have questions? Email Ken at <a href='mailto:ken@impactree.org'>ken@impactree.org</a></p>
        //                                <p><a href='{requestOrigin}/settings' target='_blank'>Unsubscribe</a> from CataCap notifications.</p>
        //                            </body>
        //                        </html>";

        //        allEmailTasks.Add(_mailService.SendMailAsync(user.Email, subject, "", body));
        //    }

        //    await Task.WhenAll(allEmailTasks);
        //});

        return Ok(new { success = true, data = await _repository.UserAuthentication.CreateTokenAsync() });
    }

    [HttpPost("admin/login")]
    [ServiceFilter(typeof(ValidationFilterAttribute))]
    public async Task<IActionResult> AdminAuthenticate([FromBody] UserLoginDto user)
    {
        return !await _repository.UserAuthentication.ValidateUserAsync(user)
            ? Unauthorized()
            : Ok(new { Token = await _repository.UserAuthentication.CreateTokenAsync() });

        //var isValid = await _repository.UserAuthentication.ValidateUserAsync(user);

        //if (!isValid)
        //    return Unauthorized();

        //var dbUser = await _context.Users.FirstOrDefaultAsync(x => x.Email.ToLower() == user.Email || x.UserName.ToLower() == user.Email);

        //if (dbUser == null)
        //    return Unauthorized();

        //var roles = await _userManager.GetRolesAsync(dbUser);

        //if (roles.Contains(UserRoles.Admin) || roles.Contains(UserRoles.SuperAdmin))
        //{
        //    await _repository.UserAuthentication.SendAdminCode(dbUser.Email);

        //    return Ok(new { requires2FA = false, email = dbUser.Email });
        //}

        //return Unauthorized();
    }

    [HttpPost("login")]
    [ServiceFilter(typeof(ValidationFilterAttribute))]
    public async Task<IActionResult> Authenticate([FromBody] UserLoginDto user)
    {
        return !await _repository.UserAuthentication.ValidateUserAsync(user)
            ? Unauthorized()
            : Ok(new { Token = await _repository.UserAuthentication.CreateTokenAsync() });
    }

    public async Task<bool> VerifyCaptcha(string token)
    {
        var requestContent = new FormUrlEncodedContent(new[]
        {
            new KeyValuePair<string, string>("secret", _appSecrets.CaptchaSecretKey),
            new KeyValuePair<string, string>("response", token)
        });

        var response = await _httpClient.PostAsync("https://hcaptcha.com/siteverify", requestContent);

        var content = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(content);
        bool isSuccess = doc.RootElement.GetProperty("success").GetBoolean();

        return isSuccess;
    }

    [HttpPost("resetPassword")]
    [ServiceFilter(typeof(ValidationFilterAttribute))]
    public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordDto resetPasswordData)
    {
        var userResult = await _repository.UserAuthentication.ResetUserPasswordAsync(resetPasswordData);
        return !userResult.Succeeded ? new BadRequestObjectResult(userResult) : Ok();
    }

    [HttpPost("sendCode")]
    [ServiceFilter(typeof(ValidationFilterAttribute))]
    public async Task<IActionResult> SendCode([FromBody] EmailReceiveDto email)
    {
        if (!string.IsNullOrWhiteSpace(email.CaptchaToken))
        {
            if (!await VerifyCaptcha(email.CaptchaToken))
                return BadRequest("CAPTCHA verification failed.");
        }

        if (string.IsNullOrEmpty(email.Email))
            return BadRequest();
        var res = await _repository.UserAuthentication.SendCode(email.Email);
        return StatusCode(200);
    }

    [HttpPost("checkCode")]
    [ServiceFilter(typeof(ValidationFilterAttribute))]
    public Task<IActionResult> CheckCode([FromBody] ResetCodeDto resetCode)
    {
        var res = _repository.UserAuthentication.CheckCode(resetCode.Email, resetCode.Code);
        IActionResult result = res ? StatusCode(200) : new NotFoundResult();
        return Task.FromResult(result);
    }

    [HttpPost("verify-2fa")]
    [ServiceFilter(typeof(ValidationFilterAttribute))]
    public async Task<IActionResult> Verify2FA([FromBody] ResetCodeDto resetCode)
    {
        var user = await _repository.UserAuthentication.GetUserByEmail(resetCode.Email);

        if (user == null)
            return Ok(new { success = false, Message = "Verification code is incorrect or has expired. Please request a new code and try again." });

        var isValid = _repository.UserAuthentication.CheckCode(resetCode.Email, resetCode.Code);

        if (!isValid)
            return Ok(new { success = false, Message = "Verification code is incorrect or has expired. Please request a new code and try again." });

        var token = await _repository.UserAuthentication.CreateTokenAsync(user);

        return Ok(new { token });
    }

    [HttpPost("loginAdminToUser")]
    public async Task<IActionResult> AuthenticateAdminToUser([FromBody] UserLoginFromAdmin userLoginFromAdmin)
    {
        return await _repository.UserAuthentication
            .ValidateAdminToUserAsync(userLoginFromAdmin.UserToken, userLoginFromAdmin.Email)
                ? Ok(new { Token = await _repository.UserAuthentication.CreateTokenAsync() })
                : BadRequest();
    }

    [HttpPut("assign-group-admin")]
    public async Task<IActionResult> UpdateGroupAdmin(string userId)
    {
        if (string.IsNullOrWhiteSpace(userId))
            return BadRequest(new { Success = false, Message = "User Id is required" });

        var user = await _context.Users.FirstOrDefaultAsync(i => i.Id == userId);

        if (user == null)
            return BadRequest(new { Success = false, Message = "User not found" });

        if (!await _roleManager.RoleExistsAsync(UserRoles.GroupAdmin))
        {
            await _roleManager.CreateAsync(new ApplicationRole
            {
                Name = UserRoles.GroupAdmin,
                IsSuperAdmin = false
            });
        }

        string message;
        if (await _userManager.IsInRoleAsync(user, UserRoles.GroupAdmin))
        {
            await _userManager.RemoveFromRoleAsync(user, UserRoles.GroupAdmin);
            message = "Group admin role removed successfully.";
        }
        else
        {
            await _userManager.AddToRoleAsync(user, UserRoles.GroupAdmin);
            message = "Group admin role assigned successfully.";
        }

        return Ok(new { Success = true, Message = message });
    }

    [HttpPost("assign-role")]
    public async Task<IActionResult> AssignRole([FromBody] AssignRoleDto dto)
    {
        var user = await _userManager.FindByIdAsync(dto.UserId.ToString());
        if (user == null)
            return Ok(new { Success = false, Message = "User not found" });

        var role = await _roleManager.FindByIdAsync(dto.RoleId.ToString());
        if (role == null)
            return Ok(new { Success = false, Message = "Role not found" });

        var currentRoles = await _userManager.GetRolesAsync(user);
        if (currentRoles.Any())
            await _userManager.RemoveFromRolesAsync(user, currentRoles);

        await _userManager.AddToRoleAsync(user, role.Name);

        return Ok(new { Success = true, Message = "Role updated successfully." });
    }
}
