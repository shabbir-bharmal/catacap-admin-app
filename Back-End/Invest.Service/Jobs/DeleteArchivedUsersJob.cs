using Invest.Core.Models;
using Invest.Repo.Data;
using Invest.Service.Interfaces;
using Quartz;

namespace Invest.Service.Jobs
{
    [DisallowConcurrentExecution]
    public class DeleteArchivedUsersJob : IJob
    {
        private readonly IDeleteArchivedUsersJobService _cleanupJobService;
        private readonly RepositoryContext _context;

        public DeleteArchivedUsersJob(IDeleteArchivedUsersJobService cleanupJobService, RepositoryContext context)
        {
            _cleanupJobService = cleanupJobService;
            _context = context;
        }

        public async Task Execute(IJobExecutionContext context)
        {
            var logEntry = new SchedulerLogs
            {
                StartTime = DateTime.Now,
                JobName = context.JobDetail.Key.Name
            };

            try
            {
                await _cleanupJobService.RunCleanupAsync(context.CancellationToken);
            }
            catch (Exception ex)
            {
                logEntry.ErrorMessage = ex.ToString();
                throw new JobExecutionException(ex, refireImmediately: false);
            }
            finally
            {
                logEntry.EndTime = DateTime.Now;
                logEntry.Day3EmailCount = 0;
                logEntry.Week2EmailCount = 0;

                await _context.AddAsync(logEntry);
                await _context.SaveChangesAsync();
            }
        }
    }
}
