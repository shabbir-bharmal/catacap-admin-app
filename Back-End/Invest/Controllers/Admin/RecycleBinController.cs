using Invest.Repo.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Invest.Controllers.Admin
{
    [Route("api/admin/recycle-bin")]
    [ApiController]
    public class RecycleBinController : ControllerBase
    {
        private readonly RepositoryContext _context;

        public RecycleBinController (RepositoryContext context)
        {
            _context = context;
        }

        [HttpGet("summary")]
        public async Task<IActionResult> GetDeletedCounts()
        {
            var accountBalanceChangeLog = await _context.AccountBalanceChangeLogs.IgnoreQueryFilters().CountAsync(x => x.IsDeleted);
            var approvedBy = await _context.ApprovedBy.IgnoreQueryFilters().CountAsync(x => x.IsDeleted);
            var assetBasedPaymentRequest = await _context.AssetBasedPaymentRequest.IgnoreQueryFilters().CountAsync(x => x.IsDeleted);
            var campaign = await _context.Campaigns.IgnoreQueryFilters().CountAsync(x => x.IsDeleted);
            var cataCapTeam = await _context.CataCapTeam.IgnoreQueryFilters().CountAsync(x => x.IsDeleted);
            var completedInvestmentsDetails = await _context.CompletedInvestmentsDetails.IgnoreQueryFilters().CountAsync(x => x.IsDeleted);
            var disbursalRequest = await _context.DisbursalRequest.IgnoreQueryFilters().CountAsync(x => x.IsDeleted);
            var emailTemplate = await _context.EmailTemplate.IgnoreQueryFilters().CountAsync(x => x.IsDeleted);
            var eventdata = await _context.Event.IgnoreQueryFilters().CountAsync(x => x.IsDeleted);
            var faq = await _context.Faq.IgnoreQueryFilters().CountAsync(x => x.IsDeleted);
            var formSubmission = await _context.FormSubmission.IgnoreQueryFilters().CountAsync(x => x.IsDeleted);
            var group = await _context.Groups.IgnoreQueryFilters().CountAsync(x => x.IsDeleted);
            var investmentTag = await _context.InvestmentTag.IgnoreQueryFilters().CountAsync(x => x.IsDeleted);
            var news = await _context.News.IgnoreQueryFilters().CountAsync(x => x.IsDeleted);
            var pendingGrants = await _context.PendingGrants.IgnoreQueryFilters().CountAsync(x => x.IsDeleted);
            var recommendation = await _context.Recommendations.IgnoreQueryFilters().CountAsync(x => x.IsDeleted);
            var returnDetails = await _context.ReturnDetails.IgnoreQueryFilters().CountAsync(x => x.IsDeleted);
            var testimonial = await _context.Testimonial.IgnoreQueryFilters().CountAsync(x => x.IsDeleted);
            var theme = await _context.Themes.IgnoreQueryFilters().CountAsync(x => x.IsDeleted);
            var user = await _context.Users.IgnoreQueryFilters().CountAsync(x => x.IsDeleted);

            var totalDeleted =
                    accountBalanceChangeLog +
                    approvedBy +
                    assetBasedPaymentRequest +
                    campaign +
                    cataCapTeam +
                    completedInvestmentsDetails +
                    disbursalRequest +
                    emailTemplate +
                    eventdata +
                    faq +
                    formSubmission +
                    group +
                    investmentTag +
                    news +
                    pendingGrants +
                    recommendation +
                    returnDetails +
                    testimonial +
                    theme +
                    user;

            return Ok(new
            {
                TotalDeleted = totalDeleted,

                AccountBalanceLogs = accountBalanceChangeLog,
                ApprovedBy = approvedBy,
                AssetRequests = assetBasedPaymentRequest,
                Campaigns = campaign,
                Teams = cataCapTeam,
                CompletedInvestments = completedInvestmentsDetails,
                Disbursals = disbursalRequest,
                EmailTemplates = emailTemplate,
                Events = eventdata,
                Faqs = faq,
                FormSubmissions = formSubmission,
                Groups = group,
                InvestmentTags = investmentTag,
                News = news,
                PendingGrants = pendingGrants,
                Recommendations = recommendation,
                ReturnDetails = returnDetails,
                Testimonials = testimonial,
                Themes = theme,
                Users = user
            });
        }
    }
}
