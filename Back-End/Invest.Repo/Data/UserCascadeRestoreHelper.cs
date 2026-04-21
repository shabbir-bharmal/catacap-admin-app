using Invest.Core.Extensions;
using Microsoft.EntityFrameworkCore;

namespace Invest.Repo.Data
{
    /// <summary>
    /// Helper that cascade-restores a soft-deleted user along with the records
    /// that were soft-deleted as part of the user's delete event. Mirrors the
    /// inline logic in <see cref="Invest.Controllers.Admin.UsersController.Restore"/>.
    /// Should be called from within an existing transaction (the caller is
    /// responsible for SaveChanges / commit / rollback).
    /// </summary>
    public static class UserCascadeRestoreHelper
    {
        public static async Task<int> RestoreUsersWithCascadeAsync(
            RepositoryContext context,
            IEnumerable<string> userIds)
        {
            var ids = userIds?.Distinct().ToList() ?? new List<string>();
            if (!ids.Any()) return 0;

            var users = await context.Users
                                     .IgnoreQueryFilters()
                                     .Where(x => ids.Contains(x.Id))
                                     .ToListAsync();

            var deletedUsers = users.Where(x => x.IsDeleted).ToList();
            if (!deletedUsers.Any()) return 0;

            var userIdSet = deletedUsers.Select(x => x.Id).ToList();
            var emails = deletedUsers
                            .Where(x => x.Email != null)
                            .Select(x => x.Email!.Trim().ToLower())
                            .ToList();

            var campaigns = await context.Campaigns
                .IgnoreQueryFilters()
                .Where(x => x.UserId != null && userIdSet.Contains(x.UserId) && x.IsDeleted)
                .ToListAsync();
            var campaignIds = campaigns.Select(x => x.Id).ToList();

            var pendingGrants = await context.PendingGrants
                .IgnoreQueryFilters()
                .Where(x => (campaignIds.Contains(x.CampaignId) || userIdSet.Contains(x.UserId)) && x.IsDeleted)
                .ToListAsync();
            var pendingGrantIds = pendingGrants.Select(x => x.Id).ToList();

            var assets = await context.AssetBasedPaymentRequest
                .IgnoreQueryFilters()
                .Where(x => (campaignIds.Contains(x.CampaignId) || userIdSet.Contains(x.UserId)) && x.IsDeleted)
                .ToListAsync();
            var assetIds = assets.Select(x => x.Id).ToList();

            var disbursals = await context.DisbursalRequest
                .IgnoreQueryFilters()
                .Where(x => (campaignIds.Contains(x.CampaignId) || userIdSet.Contains(x.UserId)) && x.IsDeleted)
                .ToListAsync();

            var completed = await context.CompletedInvestmentsDetails
                .IgnoreQueryFilters()
                .Where(x => campaignIds.Contains(x.CampaignId) && x.IsDeleted)
                .ToListAsync();

            var returnMasters = await context.ReturnMasters
                .IgnoreQueryFilters()
                .Where(x => campaignIds.Contains(x.CampaignId))
                .ToListAsync();
            var returnMasterIds = returnMasters.Select(x => x.Id).ToList();

            var returnDetails = await context.ReturnDetails
                .IgnoreQueryFilters()
                .Where(x => returnMasterIds.Contains(x.ReturnMasterId) && x.IsDeleted)
                .ToListAsync();

            var accountLogs = await context.AccountBalanceChangeLogs
                .IgnoreQueryFilters()
                .Where(x =>
                    userIdSet.Contains(x.UserId) ||
                    (x.CampaignId != null && campaignIds.Contains(x.CampaignId.Value)) ||
                    (x.AssetBasedPaymentRequestId != null && assetIds.Contains(x.AssetBasedPaymentRequestId.Value)) ||
                    (x.PendingGrantsId != null && pendingGrantIds.Contains(x.PendingGrantsId.Value)))
                .Where(x => x.IsDeleted)
                .ToListAsync();

            var groups = await context.Groups
                .IgnoreQueryFilters()
                .Where(x => x.Owner != null && userIdSet.Contains(x.Owner.Id) && x.IsDeleted)
                .ToListAsync();
            var groupIds = groups.Select(x => x.Id).ToList();

            var requests = await context.Requests
                .IgnoreQueryFilters()
                .Where(x => x.GroupToFollow != null && groupIds.Contains(x.GroupToFollow.Id) && x.IsDeleted)
                .ToListAsync();

            var balances = await context.GroupAccountBalance
                .IgnoreQueryFilters()
                .Where(x => x.Group != null && groupIds.Contains(x.Group.Id) && x.IsDeleted)
                .ToListAsync();

            var leaderGroups = await context.LeaderGroup
                .IgnoreQueryFilters()
                .Where(x => groupIds.Contains(x.GroupId) && x.IsDeleted)
                .ToListAsync();

            var recommendations = await context.Recommendations
                .IgnoreQueryFilters()
                .Where(x => x.UserId != null && userIdSet.Contains(x.UserId) && x.IsDeleted)
                .ToListAsync();
            var userInvestments = await context.UserInvestments
                .IgnoreQueryFilters()
                .Where(x => x.UserId != null && userIdSet.Contains(x.UserId) && x.IsDeleted)
                .ToListAsync();
            var notifications = await context.UsersNotifications
                .IgnoreQueryFilters()
                .Where(x => x.TargetUser != null && userIdSet.Contains(x.TargetUser.Id) && x.IsDeleted)
                .ToListAsync();
            var forms = await context.FormSubmission
                .IgnoreQueryFilters()
                .Where(x => x.Email != null && emails.Contains(x.Email.ToLower().Trim()) && x.IsDeleted)
                .ToListAsync();
            var testimonials = await context.Testimonial
                .IgnoreQueryFilters()
                .Where(x => x.UserId != null && userIdSet.Contains(x.UserId) && x.IsDeleted)
                .ToListAsync();

            deletedUsers.RestoreRange();
            campaigns.RestoreRange();
            pendingGrants.RestoreRange();
            assets.RestoreRange();
            disbursals.RestoreRange();
            completed.RestoreRange();
            returnDetails.RestoreRange();
            accountLogs.RestoreRange();
            groups.RestoreRange();
            requests.RestoreRange();
            balances.RestoreRange();
            leaderGroups.RestoreRange();
            recommendations.RestoreRange();
            userInvestments.RestoreRange();
            notifications.RestoreRange();
            forms.RestoreRange();
            testimonials.RestoreRange();

            return deletedUsers.Count;
        }

        /// <summary>
        /// Returns the IDs of soft-deleted parent users referenced (by their
        /// Id) by the given child records via the foreign-key column on the
        /// child table.
        /// </summary>
        public static async Task<List<string>> FindDeletedParentUserIdsAsync<TChild>(
            RepositoryContext context,
            IQueryable<TChild> deletedChildQuery,
            Func<TChild, string?> userIdSelector) where TChild : class
        {
            var rawIds = (await deletedChildQuery.ToListAsync())
                            .Select(userIdSelector)
                            .Where(id => !string.IsNullOrEmpty(id))
                            .Select(id => id!)
                            .Distinct()
                            .ToList();

            if (!rawIds.Any()) return new List<string>();

            return await context.Users
                                .IgnoreQueryFilters()
                                .Where(u => rawIds.Contains(u.Id) && u.IsDeleted)
                                .Select(u => u.Id)
                                .ToListAsync();
        }

        /// <summary>
        /// Returns the IDs of soft-deleted parent users matched (case-
        /// insensitively) to the given child-record email column.
        /// </summary>
        public static async Task<List<string>> FindDeletedParentUserIdsByEmailAsync(
            RepositoryContext context,
            IEnumerable<string?> emails)
        {
            var normalized = emails
                                .Where(e => !string.IsNullOrWhiteSpace(e))
                                .Select(e => e!.Trim().ToLower())
                                .Distinct()
                                .ToList();
            if (!normalized.Any()) return new List<string>();

            return await context.Users
                                .IgnoreQueryFilters()
                                .Where(u => u.Email != null &&
                                            normalized.Contains(u.Email.ToLower().Trim()) &&
                                            u.IsDeleted)
                                .Select(u => u.Id)
                                .ToListAsync();
        }
    }
}
