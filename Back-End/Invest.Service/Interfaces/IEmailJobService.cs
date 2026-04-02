namespace Invest.Service.Interfaces
{
    public interface IEmailJobService
    {
        Task SendReminderEmailsAsync();
    }
}
