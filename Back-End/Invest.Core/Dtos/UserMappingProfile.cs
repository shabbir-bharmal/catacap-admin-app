using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
namespace Invest.Core.Dtos;
public class UserRegistrationDto
{
    [DefaultValue(false)]
    public bool IsAnonymous { get; init; } = false;

    [Required(ErrorMessage = "First name is required")]
    public string? FirstName { get; init; }
    public string? LastName { get; init; }

    [Required(ErrorMessage = "Username is required")]
    public string? UserName { get; init; }

    [Required(ErrorMessage = "Password is required")]
    public string? Password { get; init; }

    [Required(ErrorMessage = "Email is required")]
    public string? Email { get; init; }
    public string? CaptchaToken { get; set; }
}
