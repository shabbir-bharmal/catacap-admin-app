namespace Invest.Core.Dtos
{
    public class FeaturedGroupDto
    {
        public int Id { get; set; }
        public string? Identifier { get; set; }
        public string? Name { get; set; }
        public string? Website { get; set; }
        public string? Themes { get; set; }
        public string? Description { get; set; }
        public string? OurWhyDescription { get; set; }
        public string? PictureFileName { get; set; }
        public string? BackgroundPictureFileName { get; set; }
        public int Members { get; set; }
        public decimal OriginalBalance { get; set; }
        public string? MetaTitle { get; set; }
        public string? MetaDescription { get; set; }
    }
}
