using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Invest.Repo.Migrations
{
    public partial class AddedGroupThemesColumnOnGroupTable : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "GroupThemes",
                table: "Groups",
                type: "nvarchar(max)",
                nullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "GroupThemes",
                table: "Groups");
        }
    }
}
