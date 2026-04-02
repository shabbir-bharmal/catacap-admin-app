using Microsoft.EntityFrameworkCore.Migrations;

namespace Invest.Repo.Migrations
{
    public partial class UpdateDescriptionColumn : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "Description",
                table: "Campaigns",
                type: "nvarchar(2200)",
                maxLength: 2200,
                nullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "Terms",
                table: "Campaigns",
                type: "nvarchar(2200)",
                maxLength: 2200,
                nullable: true);
        }
    }
}