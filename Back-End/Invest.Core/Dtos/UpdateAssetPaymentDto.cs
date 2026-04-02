namespace Invest.Core.Dtos
{
    public class UpdateAssetPaymentDto
    {
        public int Id { get; set; }
        public string Status { get; set; } = string.Empty;
        public decimal Amount { get; set; }
        public string? Note { get; set; }
        public List<string?> NoteEmail { get; set; } = new List<string?>();
    }
}
