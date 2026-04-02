using System.ComponentModel.DataAnnotations.Schema;

namespace Invest.Core.Dtos
{
    public class InvestmentNotesDto
    {
        public string? Date { get; set; }
        public string? UserName { get; set; }
        public string? Note { get; set; }
        public string? OldStatus { get; set; }
        public string? NewStatus { get; set; }
    }
}
