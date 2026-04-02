using System.ComponentModel.DataAnnotations;

namespace Invest.Core.Dtos;

public class CategoryDto
{
    public int Id { get; set; }

    [Required(ErrorMessage = "Category name is a required field.")]
    public string? Name { get; set; }
    public bool Mandatory { get; set; }
}

public class CategoryCreationDto : CategoryAddAndUpdateDto
{
}

public class CategoryUpdateDto : CategoryAddAndUpdateDto
{
}


public abstract class CategoryAddAndUpdateDto
{
    [Required(ErrorMessage = "Category name is a required field.")]
    [MaxLength(100, ErrorMessage = "Maximum length for the Name is 30 characters.")]
    public string? Name { get; set; }

    public bool Mandatory { get; set; }
}
