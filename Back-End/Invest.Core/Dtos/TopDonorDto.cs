namespace Invest.Core.Dtos
{
    public class TopDonorDto
    {
        public string Donor { get; set; } = string.Empty;
        public decimal Amount { get; set; }
        public int Donations { get; set; }
    }
}
