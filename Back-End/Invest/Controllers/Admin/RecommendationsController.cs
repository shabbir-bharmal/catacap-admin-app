using AutoMapper;
using ClosedXML.Excel;
using DocumentFormat.OpenXml.Bibliography;
using Invest.Authorization.Helper;
using Invest.Core.Constants;
using Invest.Core.Dtos;
using Invest.Core.Extensions;
using Invest.Core.Models;
using Invest.Core.Settings;
using Invest.Repo.Data;
using Invest.Service.Interfaces;
using Invest.Service.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Stripe.V2;
using System.Security.Claims;

namespace Invest.Controllers.Admin
{
    [Route("api/admin/recommendation")]
    [ApiController]
    public class RecommendationsController : ControllerBase
    {
        private readonly RepositoryContext _context;
        protected readonly IRepositoryManager _repository;
        private readonly IMapper _mapper;
        private readonly IHttpContextAccessor _httpContextAccessor;
        private readonly IMailService _mailService;
        private readonly EmailQueue _emailQueue;
        private readonly ImageService _imageService;
        private readonly AppSecrets _appSecrets;

        public RecommendationsController(RepositoryContext context, IRepositoryManager repository, IMapper mapper, IHttpContextAccessor httpContextAccessor, IMailService mailService, EmailQueue emailQueue, ImageService imageService, AppSecrets appSecrets)
        {
            _context = context;
            _repository = repository;
            _mapper = mapper;
            _httpContextAccessor = httpContextAccessor;
            _mailService = mailService;
            _emailQueue = emailQueue;
            _imageService = imageService;
            _appSecrets = appSecrets;
        }

        [HttpGet]
        public async Task<IActionResult> Get([FromQuery] PaginationDto pagination)
        {
            bool isAsc = pagination?.SortDirection?.ToLower() == "asc";
            bool? isDeleted = pagination?.IsDeleted;

            var statusList = pagination?.Status?.Split(',', StringSplitOptions.RemoveEmptyEntries).Select(s => s.Trim().ToLower()).ToList();

            var usersQuery = _context.Users
                                     .Join(_context.UserRoles,
                                         u => u.Id,
                                         ur => ur.UserId,
                                         (u, ur) => new { u, ur })
                                     .Join(_context.Roles,
                                         x => x.ur.RoleId,
                                         r => r.Id,
                                         (x, r) => new { x.u, r })
                                     .Where(x => x.r.Name == UserRoles.User)
                                     .Select(x => x.u);

            var query = _context.Recommendations
                                .ApplySoftDeleteFilter(isDeleted)
                                .Join(usersQuery,
                                    r => r.UserEmail,
                                    u => u.Email,
                                    (r, u) => r)
                                .Include(r => r.Campaign)
                                .Include(r => r.RejectedByUser)
                                .AsQueryable();

            if (pagination?.InvestmentId != null)
                query = query.Where(x => x.CampaignId == pagination.InvestmentId);

            if (statusList != null && statusList.Count > 0)
                query = query.Where(x => !string.IsNullOrEmpty(x.Status) && statusList.Contains(x.Status.ToLower()));

            var orderedQuery = pagination?.SortField?.ToLower() switch
            {
                "id" => isAsc ? query.OrderBy(r => r.Id) : query.OrderByDescending(r => r.Id),
                "userfullname" => isAsc ? query.OrderBy(r => r.UserFullName) : query.OrderByDescending(r => r.UserFullName),
                "status" => isAsc ? query.OrderBy(r => r.Status) : query.OrderByDescending(r => r.Status),
                "campaignname" => isAsc ? query.OrderBy(r => r.Campaign!.Name) : query.OrderByDescending(r => r.Campaign!.Name),
                "amount" => isAsc ? query.OrderBy(r => r.Amount) : query.OrderByDescending(r => r.Amount),
                "datecreated" => isAsc ? query.OrderBy(r => r.DateCreated) : query.OrderByDescending(r => r.DateCreated),
                _ => query.OrderByDescending(r => r.DateCreated)
            };

            var finalQuery = orderedQuery.ThenBy(r => r.Id);

            int page = pagination?.CurrentPage ?? 1;
            int pageSize = pagination?.PerPage ?? 50;

            int totalCount = await query.CountAsync();

            var pagedData = await finalQuery
                                 .Skip((page - 1) * pageSize)
                                 .Take(pageSize)
                                 .Select(r => new
                                 {
                                     r.Id,
                                     r.UserEmail,
                                     r.UserFullName,
                                     r.Status,
                                     r.Amount,
                                     CampaignId = r.Campaign!.Id,
                                     CampaignName = r.Campaign.Name,
                                     r.RejectionMemo,
                                     RejectedBy = r.RejectedByUser != null ? r.RejectedByUser.FirstName : null,
                                     r.DateCreated,
                                     r.DeletedAt,
                                     DeletedBy = r.DeletedByUser != null
                                                ? $"{r.DeletedByUser.FirstName} {r.DeletedByUser.LastName}"
                                                : null
                                 })
                                 .ToListAsync();

            var recommendationStats = await query
                                        .GroupBy(r => 1)
                                        .Select(g => new
                                        {
                                            Pending = g.Where(r => r.Status!.ToLower().Trim() == "pending")
                                                            .Sum(r => (decimal?)r.Amount) ?? 0m,
                                            Approved = g.Where(r => r.Status!.ToLower().Trim() == "approved")
                                                            .Sum(r => (decimal?)r.Amount) ?? 0m,
                                        })
                                        .FirstOrDefaultAsync();

            if (pagedData.Any())
                return Ok(new
                {
                    items = pagedData,
                    totalCount,
                    recommendationStats!.Pending,
                    recommendationStats.Approved,
                    total = recommendationStats.Pending + recommendationStats.Approved
                });

            return Ok(new { Success = false, Message = "Data not found." });
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateStatus(int id, [FromBody] RecommendationsDto data)
        {
            if (data == null)
                return BadRequest(new { Success = false, Message = "Data type is invalid" });

            var recommendation = await _context.Recommendations
                                                .Include(item => item.Campaign)
                                                .Include(item => item.RejectedByUser)
                                                .FirstOrDefaultAsync(item => item.Id == id);
            if (recommendation == null)
                return Ok(new { Success = false, Message = "Recommendation data not found" });

            var user = await _repository.UserAuthentication.GetUserByEmail(recommendation?.UserEmail!);
            if (user == null)
                return Ok(new { Success = false, Message = "Recommendation cannot be rejected because the user does not exist" });

            var identity = HttpContext.User.Identity as ClaimsIdentity;
            var loginUserId = identity?.Claims.FirstOrDefault(i => i.Type == "id")?.Value;

            recommendation!.Amount = data.Amount;
            recommendation.Status = data.Status;
            recommendation.UserEmail = data.UserEmail;

            if (recommendation.Status == "rejected")
            {
                var log = new AccountBalanceChangeLog
                {
                    UserId = user.Id,
                    PaymentType = $"Recommendation reverted, Id = {recommendation?.Id}",
                    InvestmentName = recommendation?.Campaign?.Name,
                    CampaignId = recommendation?.CampaignId,
                    OldValue = user.AccountBalance,
                    UserName = user.UserName,
                    NewValue = user.AccountBalance + recommendation?.Amount
                };
                await _context.AccountBalanceChangeLogs.AddAsync(log);

                user.AccountBalance += recommendation?.Amount;
                await _repository.UserAuthentication.UpdateUser(user);

                recommendation!.RejectionMemo = data.RejectionMemo != string.Empty ? data.RejectionMemo?.Trim() : null;
                recommendation.RejectedBy = loginUserId!;
                recommendation.RejectionDate = DateTime.Now;
            }
            await _repository.SaveAsync();

            var rejectingUser = await _repository.UserAuthentication.GetUserById(loginUserId!);

            return Ok(new
            {
                Success = true,
                Message = "Recommendation status updated successfully.",
                Data = new
                {
                    data.Status,
                    RejectedBy = rejectingUser.FirstName!.Trim().ToLower(),
                    recommendation?.RejectionMemo
                }
            });
        }

        [HttpPost]
        public async Task<IActionResult> Create([FromBody] AddRecommendationDto addRecommendation)
        {
            CommonResponse response = new();
            var allEmailTasks = new List<Task>();
            User? user = null;

            if (addRecommendation.User != null)
                user = addRecommendation.User!;
            else
                user = await _context.Users.FirstOrDefaultAsync(i => i.Email == addRecommendation.UserEmail);

            var userId = user!.Id;
            var userFirstName = user?.FirstName;
            var userLastName = user?.LastName;

            CampaignDto campaign = addRecommendation.Campaign!;
            var campaignId = campaign?.Id;
            string? campaignName = campaign?.Name;
            string? campaignProperty = campaign?.Property;
            string? campaignDescription = campaign?.Description;
            var campaignAddedTotalAdminRaised = campaign?.AddedTotalAdminRaised;
            string? campaignContactInfoFullName = campaign?.ContactInfoFullName;
            string? campaignContactInfoEmailAddress = campaign?.ContactInfoEmailAddress;

            string investmentAmount = string.Format(System.Globalization.CultureInfo.GetCultureInfo("en-US"), "${0:N2}", Convert.ToDecimal(addRecommendation.Amount));

            var recommendation = _mapper.Map<AddRecommendationDto, Recommendation>(addRecommendation);
            recommendation.Status = "pending";
            recommendation.CampaignId = campaignId;
            recommendation.UserId = userId;
            recommendation.DateCreated = DateTime.Now;
            if (user?.AccountBalance < recommendation.Amount && !addRecommendation.IsGroupAccountBalance)
            {
                recommendation.Amount = user?.AccountBalance;
            }
            await _context.Recommendations.AddAsync(recommendation);
            await _context.SaveChangesAsync();

            decimal originalInvestmentAmount = Convert.ToDecimal(recommendation.Amount);

            var userInvestment = new UserInvestments
            {
                UserId = userId,
                CampaignName = campaignName,
                CampaignId = campaignId,
                PaymentType = "Wallet",
                LogTriggered = true
            };
            await _context.UserInvestments.AddAsync(userInvestment);

            var groupAccountBalances = await _context.GroupAccountBalance
                                        .Include(gab => gab.Group)
                                        .Where(gab => gab.User.Id == user!.Id)
                                        .OrderBy(gab => gab.Id)
                                        .ToListAsync();

            decimal totalGroupBalance = groupAccountBalances.Sum(gab => gab.Balance);
            decimal amountToDeduct = Convert.ToDecimal(recommendation.Amount);

            string? assetType = addRecommendation.AssetBasedPaymentRequest != null
                                        ? !string.IsNullOrWhiteSpace(addRecommendation.AssetBasedPaymentRequest?.AssetDescription)
                                            ? $"{addRecommendation.AssetBasedPaymentRequest?.AssetDescription}"
                                            : $"{addRecommendation.AssetBasedPaymentRequest?.AssetType.Type}"
                                        : null;

            if (!addRecommendation.IsGroupAccountBalance)
            {
                await AddPersonalDeduction(user!, amountToDeduct, campaignName!, campaignId, addRecommendation.PendingGrants?.DAFProvider, assetType);
            }
            else
            {
                amountToDeduct = await DeductFromGroupAccounts(user!, groupAccountBalances, amountToDeduct, campaignName!, campaignId);

                if (amountToDeduct > 0)
                {
                    if (user!.AccountBalance < amountToDeduct)
                    {
                        decimal shortfall = Convert.ToDecimal(amountToDeduct) - Convert.ToDecimal(user.AccountBalance);
                        recommendation.Amount -= shortfall;
                        amountToDeduct = Convert.ToDecimal(user.AccountBalance);
                    }

                    await AddPersonalDeduction(user, amountToDeduct, campaignName!, campaignId, addRecommendation.PendingGrants?.DAFProvider, assetType);
                }
            }

            var usersToSendNotifications = await _context.Requests
                                                .Where(i => i.UserToFollow != null
                                                            && i.UserToFollow.Id == userId
                                                            && i.Status == "accepted")
                                                .Select(i => i.RequestOwner)
                                                .ToListAsync();

            var notifications = usersToSendNotifications.Select(userToSend => new UsersNotification
            {
                Title = "Recommendation created",
                Description = $"Recommendation is created by user: {userFirstName} {userLastName}",
                isRead = false,
                PictureFileName = user!.ConsentToShowAvatar ? user?.PictureFileName : null,
                TargetUser = userToSend!,
                UrlToRedirect = $"/investment/{campaignId}"
            }).ToList();

            await _context.UsersNotifications.AddRangeAsync(notifications);
            await _context.SaveChangesAsync();

            await _repository.UserAuthentication.UpdateUser(user!);
            await _repository.SaveAsync();


            var requestHeader = HttpContext?.Request.Headers["Origin"].ToString() == null ? _httpContextAccessor.HttpContext?.Request.Headers["Origin"].ToString() : HttpContext?.Request.Headers["Origin"].ToString();

            var userEmailsToSendEmailMessageCase = await _context.Requests
                                                    .Where(i => i.UserToFollow != null
                                                                && i.RequestOwner != null
                                                                && i.UserToFollow.Id == userId)
                                                    .Select(i => new UserEmailInfo
                                                    {
                                                        Email = i.RequestOwner!.Email,
                                                        FirstName = i.RequestOwner.FirstName!,
                                                        LastName = i.RequestOwner.LastName!
                                                    }).ToListAsync();
            var usersToSendEmailCase = await GetUsersForEmailsAsync(userEmailsToSendEmailMessageCase, null, true);
            var emailsForGroupAndUser = usersToSendEmailCase.Select(i => new { i.Email, i.FirstName, i.LastName }).Distinct().ToList();


            var userEmailsToSendEmailMessage = await _context.Requests
                                                    .Where(i => i.RequestOwner != null
                                                                && i.UserToFollow != null
                                                                && i.RequestOwner.Id == userId)
                                                    .Select(i => new { i.UserToFollow!.Email, i.UserToFollow.FirstName, i.UserToFollow.LastName })
                                                    .ToListAsync();
            var emails = userEmailsToSendEmailMessage.Select(i => i.Email);
            var usersToSendEmail = await _context.Users
                                        .Where(u => emails.Contains(u.Email) && (u.OptOutEmailNotifications == null || !(bool)u.OptOutEmailNotifications))
                                        .Select(u => u.Email)
                                        .ToListAsync();
            var rec = await _context.Recommendations.Where(i => i.Campaign != null && i.Campaign.Id == addRecommendation.Campaign!.Id && usersToSendEmail.Contains(i.UserEmail!)).ToListAsync();
            var uniqueRec = rec.DistinctBy(x => new { x.UserEmail }).ToList();


            var recommendationsQuery = _context.Recommendations
                                            .AsNoTracking()
                                            .Where(r =>
                                                (r.Status == "approved" || r.Status == "pending") &&
                                                r.Campaign != null &&
                                                r.Campaign.Id == campaignId &&
                                                r.Amount > 0 &&
                                                r.UserEmail != null);

            var totalDonationAmount = await recommendationsQuery.SumAsync(r => r.Amount ?? 0);
            var totalInvestors = await recommendationsQuery.Select(r => r.UserEmail).Distinct().CountAsync();

            var campaignIdentifier = campaignProperty ?? campaignId?.ToString();

            string conditionalUserName = user?.IsAnonymousInvestment == true
                ? "Someone"
                : $"{userFirstName} {userLastName}";

            string conditionalDonorName = user?.IsAnonymousInvestment == true
                ? "An anonymous CataCap donor"
                : $"{userFirstName} {userLastName}";

            var commonVariables = new Dictionary<string, string>
            {
                { "logoUrl", await _imageService.GetImageUrl() },
                { "campaignName", campaignName! },
                { "campaignDescription", campaignDescription! },
                { "campaignUrl", $"{_appSecrets.RequestOrigin}/investments/{campaignIdentifier}" },
                { "unsubscribeUrl", $"{_appSecrets.RequestOrigin}/settings" },
                { "investorDisplayName", conditionalUserName },
                { "donorName", conditionalDonorName }
            };

            foreach (var email in emailsForGroupAndUser)
            {
                var variables = new Dictionary<string, string>(commonVariables)
                {
                    { "firstName", email.FirstName }
                };

                _emailQueue.QueueEmail(async (sp) =>
                {
                    var emailService = sp.GetRequiredService<IEmailTemplateService>();

                    await emailService.SendTemplateEmailAsync(
                        EmailTemplateCategory.CampaignInvestmentNotification,
                        email.Email,
                        variables
                    );
                });
            }

            foreach (var email in uniqueRec)
            {
                var variables = new Dictionary<string, string>(commonVariables)
                {
                    { "userFullName", email.UserFullName! }
                };

                _emailQueue.QueueEmail(async (sp) =>
                {
                    var emailService = sp.GetRequiredService<IEmailTemplateService>();

                    await emailService.SendTemplateEmailAsync(
                        EmailTemplateCategory.FollowerInfluenceNotification,
                        email.UserEmail!,
                        variables
                    );
                });
            }

            if (!addRecommendation.IsRequestForInTransit && (user!.OptOutEmailNotifications == null || !(bool)user.OptOutEmailNotifications))
            {
                var variables = new Dictionary<string, string>(commonVariables)
                {
                    { "firstName", user.FirstName! },
                    { "investmentAmount", investmentAmount }
                };

                _emailQueue.QueueEmail(async (sp) =>
                {
                    var emailService = sp.GetRequiredService<IEmailTemplateService>();

                    await emailService.SendTemplateEmailAsync(
                        EmailTemplateCategory.DonationConfirmation,
                        user.Email,
                        variables
                    );
                });
            }

            if (!string.IsNullOrEmpty(campaignContactInfoEmailAddress))
            {
                string formattedOriginalInvestmentAmount = string.Format(System.Globalization.CultureInfo.GetCultureInfo("en-US"), "${0:N2}", originalInvestmentAmount);
                string formattedtotalDonationAmount = string.Format(System.Globalization.CultureInfo.GetCultureInfo("en-US"), "${0:N2}", totalDonationAmount);

                string investorName = user?.IsAnonymousInvestment == true
                    ? "a donor-investor"
                    : $"{userFirstName} {userLastName}";

                var variables = new Dictionary<string, string>(commonVariables)
                {
                    { "campaignFirstName", campaignContactInfoFullName?.Split(' ')[0] ?? "" },
                    { "investorName", investorName },
                    { "investmentAmount", formattedOriginalInvestmentAmount },
                    { "totalRaised", formattedtotalDonationAmount },
                    { "totalInvestors", totalInvestors.ToString() },
                    { "campaignPageUrl", $"{_appSecrets.RequestOrigin}/investments/{campaignIdentifier}" }
                };

                _emailQueue.QueueEmail(async (sp) =>
                {
                    var emailService = sp.GetRequiredService<IEmailTemplateService>();

                    await emailService.SendTemplateEmailAsync(
                        EmailTemplateCategory.CampaignOwnerFundingNotification,
                        campaignContactInfoEmailAddress,
                        variables
                    );
                });
            }

            //_ = Task.Run(async () =>
            //{
            //    string emailLogoUrl = $"{requestHeader}/logo-for-email.png";
            //    string emailLogo = $@"
            //                    <div style='text-align: center;'>
            //                        <a href='https://catacap.org' target='_blank'>
            //                            <img src='{emailLogoUrl}' alt='CataCap Logo' width='300' height='150' />
            //                        </a>
            //                    </div>";

            //    var campaignIdentifier = campaignProperty ?? campaignId?.ToString();
            //    string conditionalUserName = user?.IsAnonymousInvestment == true ? "Someone" : $"{userFirstName} {userLastName}";
            //    string conditionalDonorName = user?.IsAnonymousInvestment == true ? "An anonymous CataCap donor" : $"{userFirstName} {userLastName}";

            //    var emailTaskForFollowing = emailsForGroupAndUser.Select(email =>
            //    {
            //        var subject = $"👀 {conditionalUserName} Just Invested in {campaignName}";

            //        var body = emailLogo + $@"
            //                            <p><b>Hi {email.FirstName},</b></p>
            //                            <p>{conditionalDonorName} just made an investment in <b>{campaignName}</b> through CataCap — and we thought you’d want to know.</p>
            //                            <div style='margin-bottom: 20px; margin-top: 20px;'><hr></div>
            //                            <p><div style='font-size: 20px;'><b>🌱 About {campaignName}</b></div></p>
            //                            <p>{campaignDescription}</p>
            //                            <p><b>🔗 Learn more here <a href='{requestHeader}/invest/{campaignIdentifier}'>Check it out</a>!</b></p>
            //                            <div style='margin-bottom: 20px; margin-top: 20px;'><hr></div>
            //                            <p>Thanks for being part of the growing CataCap community — and for your commitment to moving capital toward real, scalable solutions.</p>
            //                            <p style='margin-bottom: 0px;'><b>Onward,</b></p>
            //                            <p style='margin-bottom: 0px; margin-top: 0px;'>The CataCap Team</p>
            //                            <p style='margin-top: 0px;'>🌍 <a href='https://catacap.org/'>catacap.org</a> | 💼 <a href='https://www.linkedin.com/company/catacap-us/'>Follow us on LinkedIn</a></p>
            //                            <p><a href='{requestHeader}/settings' target='_blank'>Unsubscribe</a> from CataCap notifications.</p>
            //                        ";

            //        return _mailService.SendMailAsync(email.Email, subject, "", body);

            //    }).ToList();

            //    allEmailTasks.AddRange(emailTaskForFollowing);


            //    var emailTaskForMyFollowes = uniqueRec.Select(email =>
            //    {
            //        var subject = $"🎉 {conditionalUserName} Just Followed Your Lead on CataCap!";
            //        var body = emailLogo + $@"
            //                        <p>Hi {email.UserFullName},</p>
            //                        <p>Big news—you’re inspiring change!</p>
            //                        <p>{conditionalUserName} who follows you on CataCap, just made the same impact investment you did in {campaignName}. That’s right—your leadership is sparking action.</p>
            //                        <p>By investing in solutions that advance <b>Gender Equity</b>,<b> Racial Justice</b>, and more, you're not just backing bold ideas—you’re motivating others to do the same. That’s real influence.</p>
            //                        <p style='margin: 0px;'>Want to keep the momentum going?</p>
            //                        <p>Share the love and invite others to join you in investing in <b>{campaignName}</b>:</p>
            //                        <p>👉 <a href='{requestHeader}/invest/{campaignIdentifier}'>{campaignName}</a></p>
            //                        <p>Thanks for being a changemaker. We’re lucky to have you in the CataCap community.</p>
            //                        <p style='margin-bottom: 0px;'>Onward,</p>
            //                        <p style='margin-bottom: 0px; margin-top: 0px;'>The CataCap Team</p>
            //                        <p style='margin-top: 0px;'>🌍 <a href='https://catacap.org/'>catacap.org</a> | 💼 <a href='https://www.linkedin.com/company/catacap-us/'>Follow us on LinkedIn</a></p>
            //                        <p><a href='{requestHeader}/settings' target='_blank'>Unsubscribe</a> from CataCap notifications.</p>
            //                        ";

            //        return _mailService.SendMailAsync(email.UserEmail!, subject, "", body);

            //    }).ToList();

            //    allEmailTasks.AddRange(emailTaskForMyFollowes);


            //    if (!addRecommendation.IsRequestForInTransit)
            //    {
            //        if (user!.OptOutEmailNotifications == null || !(bool)user.OptOutEmailNotifications)
            //        {
            //            var subject = "Thank You for Fueling Impact with Your Donation";
            //            var body = emailLogo + $@"
            //                                <p><b>Hi {user.FirstName},</b></p>
            //                                <p>Thank you for your generous <b>contribution of {investmentAmount}</b> to CataCap and your recommendation that it be allocated toward <b>{campaignName}</b>.</p>
            //                                <p>Your donation doesn’t just sit still — it goes to work, helping unlock capital for the most innovative and underfunded solutions on the planet. You’re helping drive real change by putting your capital where it counts.</p>
            //                                <p>Please keep this message for your tax records.</p>
            //                                <div style='margin-bottom: 20px; margin-top: 20px;'><hr></div>
            //                                <p><div style='font-size: 17px;'><b>Donation/Investment Summary</b></div></p>
            //                                <p style='margin-bottom: 0px;'><b>Recipient:</b> CataCap</p>
            //                                <p style='margin-bottom: 0px; margin-top: 0px;'><b>EIN:</b> 86-2370923<br/></p>
            //                                <p style='margin-top: 0px;'><b>Address:</b> 3749 Buchanan Street, Unit 475207, San Francisco, CA 94147</p>
            //                                <div style='margin-bottom: 20px; margin-top: 20px;'><hr></div>
            //                                <p>Thank you for being part of this movement — and for backing the future we all want to live in.</p>
            //                                <p style='margin-bottom: 0px;'><b>Let’s keep building, together.</b></p>
            //                                <p style='margin-bottom: 0px; margin-top: 0px;'>Warmly,</p>
            //                                <p style='margin-bottom: 0px; margin-top: 0px;'>Ken Kurtzig</p>
            //                                <p style='margin-top: 0px;'>Co-Founder, CataCap</p>
            //                                <p style='margin-bottom: 0px;'>🌍 <a href='https://catacap.org/'>catacap.org</a> | 💼 <a href='https://www.linkedin.com/company/catacap-us/'>Follow us on LinkedIn</a></p>
            //                                <p style='margin-top: 0px;'><a href='{requestHeader}/settings' target='_blank'>Unsubscribe</a> from CataCap notifications.</p>
            //                            ";

            //            allEmailTasks.Add(_mailService.SendMailAsync(user.Email, subject, "", body));
            //        }
            //    }

            //    if (!string.IsNullOrEmpty(campaignContactInfoEmailAddress))
            //    {
            //        string formattedOriginalInvestmentAmount = string.Format(System.Globalization.CultureInfo.GetCultureInfo("en-US"), "${0:N2}", originalInvestmentAmount);
            //        string formattedtotalDonationAmount = string.Format(System.Globalization.CultureInfo.GetCultureInfo("en-US"), "${0:N2}", totalDonationAmount);
            //        string investorName = user?.IsAnonymousInvestment == true ? "a donor-investor" : $"{userFirstName} {userLastName}";

            //        var subject = "You Got Funded! Your CataCap Campaign Is Growing";

            //        var body = emailLogo + $@"
						      //          <p><b>Hi {campaignContactInfoFullName?.Split(' ')[0]},</b></p>
						      //          <p>Great news — <b>{investorName}</b> just contributed <b>{formattedOriginalInvestmentAmount}</b> to your investment on CataCap!</p>
						      //          <p>Your total raised is now <b>{formattedtotalDonationAmount}</b> from <b>{totalInvestors} incredible supporters</b> who believe in your mission. Every dollar is a vote of confidence in the impact you’re creating — and momentum is building.</p>
						      //          <p>🔗 <a href='{requestHeader}/invest/{campaignIdentifier}'>View your live investment page</a></p>
						      //          <div style='margin-bottom: 20px; margin-top: 20px;'><hr></div>
						      //          <p><div style='font-size: 20px;'><b>📣 Keep the Momentum Flowing</b></div></p>
						      //          <p>This is the perfect time to <b>share your page</b> with your network and invite others to join you. The more visibility your campaign has, the more catalytic it becomes. <a href='https://www.notion.so/Launch-your-Investment-on-CataCap-1c3c1b9e894580949194e1a6eeaaed6c?pvs=4'>Check out your Investment Success Toolkit here</a>.</p>
						      //          <p>We’re here to help — whether you need:</p>
						      //          <ul style='list-style-type:disc;'>
							     //           <li>Messaging support for an update</li>
							     //           <li>Share graphics or templates</li>
							     //           <li>Ideas to activate new networks</li>
						      //          </ul>
						      //          <p style='margin-top: 8px'><b>Let’s keep it going. Your impact deserves the spotlight.</b></p>
            //                            <p style='margin-bottom: 0px;'>With deep gratitude,</p>
						      //          <p style='margin-top: 0px;'>— The CataCap Team</p>
						      //          <p>🌍 <a href='https://catacap.org/'>catacap.org</a> | 💼 <a href='https://www.linkedin.com/company/catacap-us/'>Follow us on LinkedIn</a><br/>
						      //          <p><a href='{requestHeader}/settings' target='_blank'>Unsubscribe</a> from CataCap notifications.</p>
						      //      ";

            //        allEmailTasks.Add(_mailService.SendMailAsync(campaignContactInfoEmailAddress, subject, "", body));
            //    }
            //    await Task.WhenAll(allEmailTasks);
            //});

            response.Success = true;
            response.Message = "Recommendation created successfully.";

            if (user != null)
                response.Data = _mapper.Map<UserDetailsDto>(user);

            return Ok(response);
        }

        [HttpGet("export")]
        public async Task<IActionResult> Export()
        {
            var usersQuery = _context.Users
                                     .Join(_context.UserRoles,
                                         u => u.Id,
                                         ur => ur.UserId,
                                         (u, ur) => new { u, ur })
                                     .Join(_context.Roles,
                                         x => x.ur.RoleId,
                                         r => r.Id,
                                         (x, r) => new { x.u, r })
                                     .Where(x => x.r.Name == UserRoles.User)
                                     .Select(x => x.u);

            var recommendations = await _context.Recommendations
                                                .Join(usersQuery,
                                                      r => r.UserEmail,
                                                      u => u.Email,
                                                      (r, u) => r)
                                                .Include(r => r.Campaign)
                                                .Include(r => r.RejectedByUser)
                                                .ToListAsync();

            recommendations = recommendations.OrderByDescending(d => d.Id).ToList();

            string contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            string fileName = "Recommendations.xlsx";

            using (var workbook = new XLWorkbook())
            {
                IXLWorksheet worksheet = workbook.Worksheets.Add("Recommendations");

                worksheet.Cell(1, 1).Value = "Id";
                worksheet.Cell(1, 2).Value = "UserFullName";
                worksheet.Cell(1, 3).Value = "UserEmail";
                worksheet.Cell(1, 4).Value = "InvestmentName";
                worksheet.Cell(1, 5).Value = "Amount";
                worksheet.Cell(1, 6).Value = "DateCreated";
                worksheet.Cell(1, 7).Value = "Status";
                worksheet.Cell(1, 8).Value = "RejectionMemo";
                worksheet.Cell(1, 9).Value = "RejectedBy";
                worksheet.Cell(1, 10).Value = "RejectionDate";

                var headerRow = worksheet.Row(1);
                headerRow.Style.Font.Bold = true;
                worksheet.Columns().Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Left;

                for (int index = 0; index < recommendations.Count; index++)
                {
                    worksheet.Cell(index + 2, 1).Value = recommendations[index].Id;
                    worksheet.Cell(index + 2, 2).Value = recommendations[index].UserFullName;
                    worksheet.Cell(index + 2, 3).Value = recommendations[index].UserEmail;
                    worksheet.Cell(index + 2, 4).Value = recommendations[index].Campaign!.Name;
                    worksheet.Cell(index + 2, 5).Value = recommendations[index].Amount;
                    worksheet.Cell(index + 2, 6).Value = recommendations[index].DateCreated;
                    worksheet.Cell(index + 2, 7).Value = recommendations[index].Status;
                    worksheet.Cell(index + 2, 8).Value = recommendations[index].RejectionMemo;
                    worksheet.Cell(index + 2, 9).Value = recommendations[index].RejectedByUser?.FirstName != null ? recommendations[index].RejectedByUser!.FirstName : null;
                    worksheet.Cell(index + 2, 10).Value = recommendations[index].RejectionDate;
                    worksheet.Cell(index + 2, 10).Style.DateFormat.Format = "MM/dd/yyyy";
                }

                worksheet.Columns().AdjustToContents();

                foreach (var column in worksheet.Columns())
                {
                    column.Width += 10;
                }

                using (var stream = new MemoryStream())
                {
                    workbook.SaveAs(stream);
                    var content = stream.ToArray();
                    return File(content, contentType, fileName);
                }
            }
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> Delete(int id)
        {
            var entity = await _context.Recommendations.FirstOrDefaultAsync(x => x.Id == id);

            if (entity == null)
                return Ok(new { Success = false, Message = "Recommendation not found." });

            _context.Recommendations.Remove(entity);

            await _context.SaveChangesAsync();

            return Ok(new { Success = true, Message = "Recommendation deleted successfully." });
        }

        [HttpPut("restore")]
        public async Task<IActionResult> Restore([FromBody] List<int> ids)
        {
            if (ids == null || !ids.Any())
                return Ok(new { Success = false, Message = "No IDs provided." });

            var entities = await _context.Recommendations
                                         .IgnoreQueryFilters()
                                         .Where(x => ids.Contains(x.Id))
                                         .ToListAsync();

            if (!entities.Any())
                return Ok(new { Success = false, Message = "Recommendation not found." });

            var deletedEntities = entities.Where(x => x.IsDeleted).ToList();

            if (!deletedEntities.Any())
                return Ok(new { Success = false, Message = "No deleted recommendations found." });

            deletedEntities.RestoreRange();

            await _context.SaveChangesAsync();

            return Ok(new { Success = true, Message = $"{deletedEntities.Count} recommendation(s) restored successfully." });
        }

        private async Task AddPersonalDeduction(User user, decimal amount, string investmentName, int? campaignId, string? grantType, string? assetType)
        {
            var identity = HttpContext?.User.Identity as ClaimsIdentity == null ? _httpContextAccessor.HttpContext?.User.Identity as ClaimsIdentity : HttpContext.User.Identity as ClaimsIdentity;
            var loginUserId = identity?.Claims.FirstOrDefault(i => i.Type == "id")?.Value;
            var loginUser = await _repository.UserAuthentication.GetUserById(loginUserId!);

            bool isAdmin = identity?.Claims.Any(c => c.Type == ClaimTypes.Role && (c.Value == UserRoles.Admin || c.Value == UserRoles.SuperAdmin)) == true;

            if (!string.IsNullOrWhiteSpace(grantType))
            {
                grantType = grantType.ToLower() == "foundation grant"
                            ? "Foundation grant"
                            : "DAF grant";
            }

            string? paymentType = !string.IsNullOrWhiteSpace(grantType) 
                                    ? grantType 
                                    : !string.IsNullOrWhiteSpace(assetType) 
                                        ? assetType
                                        : null;

            if (string.IsNullOrWhiteSpace(paymentType))
                paymentType = "Recommendation created using account balance";
            else if (isAdmin)
                paymentType = $"{paymentType}, {loginUser?.UserName?.Trim().ToLower()}";

            var log = new AccountBalanceChangeLog
            {
                UserId = user.Id,
                PaymentType = paymentType,
                OldValue = user.AccountBalance,
                UserName = user.UserName,
                NewValue = user.AccountBalance - amount,
                InvestmentName = investmentName,
                CampaignId = campaignId
            };

            user.AccountBalance -= amount;
            await _context.AccountBalanceChangeLogs.AddAsync(log);
        }

        private async Task<decimal> DeductFromGroupAccounts(User user, List<GroupAccountBalance> balances, decimal amount, string investmentName, int? campaignId)
        {
            var identity = HttpContext?.User.Identity as ClaimsIdentity == null ? _httpContextAccessor.HttpContext?.User.Identity as ClaimsIdentity : HttpContext.User.Identity as ClaimsIdentity;
            var loginUserId = identity?.Claims.FirstOrDefault(i => i.Type == "id")?.Value;
            var loginUser = await _repository.UserAuthentication.GetUserById(loginUserId!);

            bool isAdmin = identity?.Claims.Any(c => c.Type == ClaimTypes.Role && (c.Value == UserRoles.Admin || c.Value == UserRoles.SuperAdmin)) == true;

            foreach (var gab in balances)
            {
                if (amount <= 0) break;
                if (gab.Balance <= 0) continue;

                decimal deduction = Math.Min(gab.Balance, amount);

                var log = new AccountBalanceChangeLog
                {
                    UserId = user.Id,
                    PaymentType = isAdmin ? $"Recommendation created using group balance, {loginUser.UserName!.Trim().ToLower()}" : "Recommendation created using group balance",
                    OldValue = gab.Balance,
                    UserName = user.UserName,
                    NewValue = gab.Balance - deduction,
                    InvestmentName = investmentName,
                    CampaignId = campaignId,
                    GroupId = gab.Group.Id
                };

                gab.Balance -= deduction;
                amount -= deduction;

                await _context.AccountBalanceChangeLogs.AddAsync(log);
            }

            return amount;
        }

        private async Task<List<UserEmailInfo>> GetUsersForEmailsAsync(
            IEnumerable<UserEmailInfo> users,
            bool? emailFromGroupsOn,
            bool? emailFromUsersOn)
        {
            var emails = users.Select(u => u.Email).ToList();

            return await _context.Users
                                .Where(u => emails.Contains(u.Email) &&
                                            (u.OptOutEmailNotifications == null || !(u.OptOutEmailNotifications ?? false)) &&
                                            (
                                                (emailFromGroupsOn == true && (u.EmailFromGroupsOn ?? false)) ||
                                                (emailFromUsersOn == true && (u.EmailFromUsersOn ?? false))
                                            ))
                                .Select(u => new UserEmailInfo
                                {
                                    Email = u.Email,
                                    FirstName = u.FirstName!,
                                    LastName = u.LastName!
                                })
                                .ToListAsync();
        }
    }
}
