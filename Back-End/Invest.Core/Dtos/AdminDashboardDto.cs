namespace Invest.Core.Dtos
{
    public class AdminDashboardDto
    {
        public decimal TotalDonations { get; set; }
        public int TotalGroups { get; set; }
        public int TotalUsers { get; set; }
        public decimal AverageDonation { get; set; }

        public decimal DonationGrowthPercentage { get; set; }
        public decimal GroupGrowthPercentage { get; set; }
        public decimal UserGrowthPercentage { get; set; }
        public decimal AvgDonationGrowthPercentage { get; set; }
    }
}
