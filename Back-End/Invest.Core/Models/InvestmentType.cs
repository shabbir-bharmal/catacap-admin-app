using System.ComponentModel.DataAnnotations.Schema;

namespace Invest.Core.Models
{
    public class InvestmentType
    {
        [Column("Id")]
        public int Id { get; set; }

        public string? Name { get; set; }
    }
}
