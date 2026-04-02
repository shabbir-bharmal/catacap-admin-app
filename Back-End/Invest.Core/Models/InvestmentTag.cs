namespace Invest.Core.Models
{
    public class InvestmentTag : BaseEntity
    {
        public int Id { get; set; }
        public string Tag { get; set; } = string.Empty;
    }
}