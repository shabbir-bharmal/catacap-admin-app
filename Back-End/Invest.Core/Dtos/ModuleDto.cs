namespace Invest.Core.Dtos
{
    public class ModuleDto
    {
        public int? Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string? Category { get; set; }
        public int SortOrder { get; set; }
    }
}
