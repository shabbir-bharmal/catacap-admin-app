// Ignore Spelling: Dtos Dto Cata Catacap

namespace Invest.Core.Dtos
{
    public class FinancesDto
    {
        public Users Users { get; set; } = new Users();
        public Groups Groups { get; set; } = new Groups();
        public Recommendations Recommendations { get; set; } = new Recommendations();
        public Investments Investments { get; set; } = new Investments();
        public List<InvestmentThemes> InvestmentThemes { get; set; } = new List<InvestmentThemes>();
        public Grants Grants { get; set; } = new Grants();
        public ToBalance ToBalance { get; set; } = new ToBalance();
    }

    public class Users
    {
        public int Active { get; set; }
        public int Inactive { get; set; }
        public decimal AccountBalances { get; set; }
        public decimal Investments { get; set; }
        public decimal InvestmentsPlusAccountBalances => AccountBalances + Investments;
    }

    public class Groups
    {
        public int Investments { get; set; }
        public int Leaders { get; set; }
        public int Members { get; set; }
        public int Corporate { get; set; }
    }

    public class Recommendations
    {
        public decimal Pending { get; set; }
        public decimal Approved { get; set; }
        public decimal Rejected { get; set; }
        public int ApprovedAndPending { get; set; }
        public decimal Total => Pending + Approved;
    }

    public class Investments
    {
        public decimal Average { get; set; }
        public int Active { get; set; }
        public int Over25K { get; set; }
        public int Over50K { get; set; }
        public int Completed { get; set; }
        public decimal TotalActive { get; set; }
        public decimal TotalCompleted { get; set; }
        public decimal TotalActiveAndClosed { get; set; }
        public decimal Assets { get; set; }
    }

    public class InvestmentThemes
    {
        public string Name { get; set; } = string.Empty;
        public decimal Pending { get; set; }
        public decimal Approved { get; set; }
        public decimal Total => Pending + Approved;
    }

    public class Grants
    {
        public decimal PendingAndInTransit { get; set; }
        public decimal PendingAndInTransitOtherAssets { get; set; }
    }

    public class ToBalance
    {
        public decimal Recommendations { get; set; }
        public decimal ActiveAndClosed { get; set; }
        public decimal Difference => Recommendations - ActiveAndClosed;
    }
}
