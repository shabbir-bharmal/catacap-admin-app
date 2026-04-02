using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Invest.Repo.Migrations
{
    public partial class RemovedPhoneCodeAndFlagCodeColumnOnCountryTable : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "FlagCode",
                table: "Country");

            migrationBuilder.DropColumn(
                name: "PhoneCode",
                table: "Country");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "FlagCode",
                table: "Country",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "PhoneCode",
                table: "Country",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");

            migrationBuilder.UpdateData(
                table: "Country",
                keyColumn: "Id",
                keyValue: 1,
                columns: new[] { "FlagCode", "PhoneCode" },
                values: new object[] { "us", "+1" });

            migrationBuilder.UpdateData(
                table: "Country",
                keyColumn: "Id",
                keyValue: 2,
                columns: new[] { "FlagCode", "PhoneCode" },
                values: new object[] { "ar", "+54" });

            migrationBuilder.UpdateData(
                table: "Country",
                keyColumn: "Id",
                keyValue: 3,
                columns: new[] { "FlagCode", "PhoneCode" },
                values: new object[] { "au", "+61" });

            migrationBuilder.UpdateData(
                table: "Country",
                keyColumn: "Id",
                keyValue: 4,
                columns: new[] { "FlagCode", "PhoneCode" },
                values: new object[] { "at", "+43" });

            migrationBuilder.UpdateData(
                table: "Country",
                keyColumn: "Id",
                keyValue: 5,
                columns: new[] { "FlagCode", "PhoneCode" },
                values: new object[] { "be", "+32" });

            migrationBuilder.UpdateData(
                table: "Country",
                keyColumn: "Id",
                keyValue: 6,
                columns: new[] { "FlagCode", "PhoneCode" },
                values: new object[] { "bz", "+501" });

            migrationBuilder.UpdateData(
                table: "Country",
                keyColumn: "Id",
                keyValue: 7,
                columns: new[] { "FlagCode", "PhoneCode" },
                values: new object[] { "br", "+55" });

            migrationBuilder.UpdateData(
                table: "Country",
                keyColumn: "Id",
                keyValue: 8,
                columns: new[] { "FlagCode", "PhoneCode" },
                values: new object[] { "bg", "+359" });

            migrationBuilder.UpdateData(
                table: "Country",
                keyColumn: "Id",
                keyValue: 9,
                columns: new[] { "FlagCode", "PhoneCode" },
                values: new object[] { "ca", "+1" });

            migrationBuilder.UpdateData(
                table: "Country",
                keyColumn: "Id",
                keyValue: 10,
                columns: new[] { "FlagCode", "PhoneCode" },
                values: new object[] { "cl", "+56" });

            migrationBuilder.UpdateData(
                table: "Country",
                keyColumn: "Id",
                keyValue: 11,
                columns: new[] { "FlagCode", "PhoneCode" },
                values: new object[] { "cn", "+86" });

            migrationBuilder.UpdateData(
                table: "Country",
                keyColumn: "Id",
                keyValue: 12,
                columns: new[] { "FlagCode", "PhoneCode" },
                values: new object[] { "co", "+57" });

            migrationBuilder.UpdateData(
                table: "Country",
                keyColumn: "Id",
                keyValue: 13,
                columns: new[] { "FlagCode", "PhoneCode" },
                values: new object[] { "cr", "+506" });

            migrationBuilder.UpdateData(
                table: "Country",
                keyColumn: "Id",
                keyValue: 14,
                columns: new[] { "FlagCode", "PhoneCode" },
                values: new object[] { "cz", "+420" });

            migrationBuilder.UpdateData(
                table: "Country",
                keyColumn: "Id",
                keyValue: 15,
                columns: new[] { "FlagCode", "PhoneCode" },
                values: new object[] { "dk", "+45" });

            migrationBuilder.UpdateData(
                table: "Country",
                keyColumn: "Id",
                keyValue: 16,
                columns: new[] { "FlagCode", "PhoneCode" },
                values: new object[] { "fi", "+358" });

            migrationBuilder.UpdateData(
                table: "Country",
                keyColumn: "Id",
                keyValue: 17,
                columns: new[] { "FlagCode", "PhoneCode" },
                values: new object[] { "fr", "+33" });

            migrationBuilder.UpdateData(
                table: "Country",
                keyColumn: "Id",
                keyValue: 18,
                columns: new[] { "FlagCode", "PhoneCode" },
                values: new object[] { "de", "+49" });

            migrationBuilder.UpdateData(
                table: "Country",
                keyColumn: "Id",
                keyValue: 19,
                columns: new[] { "FlagCode", "PhoneCode" },
                values: new object[] { "gr", "+30" });

            migrationBuilder.UpdateData(
                table: "Country",
                keyColumn: "Id",
                keyValue: 20,
                columns: new[] { "FlagCode", "PhoneCode" },
                values: new object[] { "hu", "+36" });

            migrationBuilder.UpdateData(
                table: "Country",
                keyColumn: "Id",
                keyValue: 21,
                columns: new[] { "FlagCode", "PhoneCode" },
                values: new object[] { "is", "+354" });

            migrationBuilder.UpdateData(
                table: "Country",
                keyColumn: "Id",
                keyValue: 22,
                columns: new[] { "FlagCode", "PhoneCode" },
                values: new object[] { "in", "+91" });

            migrationBuilder.UpdateData(
                table: "Country",
                keyColumn: "Id",
                keyValue: 23,
                columns: new[] { "FlagCode", "PhoneCode" },
                values: new object[] { "id", "+62" });

            migrationBuilder.UpdateData(
                table: "Country",
                keyColumn: "Id",
                keyValue: 24,
                columns: new[] { "FlagCode", "PhoneCode" },
                values: new object[] { "ie", "+353" });

            migrationBuilder.UpdateData(
                table: "Country",
                keyColumn: "Id",
                keyValue: 25,
                columns: new[] { "FlagCode", "PhoneCode" },
                values: new object[] { "il", "+972" });

            migrationBuilder.UpdateData(
                table: "Country",
                keyColumn: "Id",
                keyValue: 26,
                columns: new[] { "FlagCode", "PhoneCode" },
                values: new object[] { "it", "+39" });

            migrationBuilder.UpdateData(
                table: "Country",
                keyColumn: "Id",
                keyValue: 27,
                columns: new[] { "FlagCode", "PhoneCode" },
                values: new object[] { "jp", "+81" });

            migrationBuilder.UpdateData(
                table: "Country",
                keyColumn: "Id",
                keyValue: 28,
                columns: new[] { "FlagCode", "PhoneCode" },
                values: new object[] { "mx", "+52" });

            migrationBuilder.UpdateData(
                table: "Country",
                keyColumn: "Id",
                keyValue: 29,
                columns: new[] { "FlagCode", "PhoneCode" },
                values: new object[] { "nl", "+31" });

            migrationBuilder.UpdateData(
                table: "Country",
                keyColumn: "Id",
                keyValue: 30,
                columns: new[] { "FlagCode", "PhoneCode" },
                values: new object[] { "nz", "+64" });

            migrationBuilder.UpdateData(
                table: "Country",
                keyColumn: "Id",
                keyValue: 31,
                columns: new[] { "FlagCode", "PhoneCode" },
                values: new object[] { "no", "+47" });

            migrationBuilder.UpdateData(
                table: "Country",
                keyColumn: "Id",
                keyValue: 32,
                columns: new[] { "FlagCode", "PhoneCode" },
                values: new object[] { "pe", "+51" });

            migrationBuilder.UpdateData(
                table: "Country",
                keyColumn: "Id",
                keyValue: 33,
                columns: new[] { "FlagCode", "PhoneCode" },
                values: new object[] { "ph", "+63" });

            migrationBuilder.UpdateData(
                table: "Country",
                keyColumn: "Id",
                keyValue: 34,
                columns: new[] { "FlagCode", "PhoneCode" },
                values: new object[] { "pl", "+48" });

            migrationBuilder.UpdateData(
                table: "Country",
                keyColumn: "Id",
                keyValue: 35,
                columns: new[] { "FlagCode", "PhoneCode" },
                values: new object[] { "pt", "+351" });

            migrationBuilder.UpdateData(
                table: "Country",
                keyColumn: "Id",
                keyValue: 36,
                columns: new[] { "FlagCode", "PhoneCode" },
                values: new object[] { "ro", "+40" });

            migrationBuilder.UpdateData(
                table: "Country",
                keyColumn: "Id",
                keyValue: 37,
                columns: new[] { "FlagCode", "PhoneCode" },
                values: new object[] { "ru", "+7" });

            migrationBuilder.UpdateData(
                table: "Country",
                keyColumn: "Id",
                keyValue: 38,
                columns: new[] { "FlagCode", "PhoneCode" },
                values: new object[] { "sg", "+65" });

            migrationBuilder.UpdateData(
                table: "Country",
                keyColumn: "Id",
                keyValue: 39,
                columns: new[] { "FlagCode", "PhoneCode" },
                values: new object[] { "za", "+27" });

            migrationBuilder.UpdateData(
                table: "Country",
                keyColumn: "Id",
                keyValue: 40,
                columns: new[] { "FlagCode", "PhoneCode" },
                values: new object[] { "es", "+34" });

            migrationBuilder.UpdateData(
                table: "Country",
                keyColumn: "Id",
                keyValue: 41,
                columns: new[] { "FlagCode", "PhoneCode" },
                values: new object[] { "se", "+46" });

            migrationBuilder.UpdateData(
                table: "Country",
                keyColumn: "Id",
                keyValue: 42,
                columns: new[] { "FlagCode", "PhoneCode" },
                values: new object[] { "ch", "+41" });

            migrationBuilder.UpdateData(
                table: "Country",
                keyColumn: "Id",
                keyValue: 43,
                columns: new[] { "FlagCode", "PhoneCode" },
                values: new object[] { "gb", "+44" });
        }
    }
}
