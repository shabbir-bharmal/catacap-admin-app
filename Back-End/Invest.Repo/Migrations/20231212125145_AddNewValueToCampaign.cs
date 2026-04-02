using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Invest.Repo.Migrations
{
    public partial class AddNewValueToCampaign : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
        /*    migrationBuilder.AddColumn<bool>(
                name: "EmailSends",
                table: "Campaigns",
                type: "bit",
                nullable: true);*/
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "EmailSends",
                table: "Campaigns");
        }
    }
}
