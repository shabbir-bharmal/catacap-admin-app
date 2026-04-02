using Invest.Service.Jobs;
using Microsoft.Extensions.DependencyInjection;
using Quartz;

namespace Invest.Service.Scheduler
{
    public static class QuartzSchedulerExtensions
    {
        public static void AddQuartzScheduler(this IServiceCollection services)
        {
            services.AddQuartz(q =>
            {
                var jobKey = new JobKey("SendReminderEmail");   
                q.AddJob<SendReminderEmail>(opts => opts.WithIdentity(jobKey));

                // Run daily at 8:00 AM EST
                q.AddTrigger(opts => opts
                    .ForJob(jobKey)
                    .WithIdentity("SendReminderEmail-trigger")
                    .WithCronSchedule("0 0 8 * * ?", x => x
                        .InTimeZone(TimeZoneInfo.FindSystemTimeZoneById("America/New_York"))
                    )
                );
            });

            services.AddQuartzHostedService(q => q.WaitForJobsToComplete = true);
        }
    }
}
