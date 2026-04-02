namespace Invest.Core.Dtos
{
    public class GroupRequestDto
    {
        public string? Themes { get; set; }
        public string? SearchValue { get; set; }
        public int? CurrentPage { get; set; }
        public int? PerPage { get; set; }
    }
}
