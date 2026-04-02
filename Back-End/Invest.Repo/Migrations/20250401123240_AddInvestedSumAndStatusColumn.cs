using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Invest.Repo.Migrations
{
    public partial class AddInvestedSumAndStatusColumn : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "InvestedSum",
                table: "PendingGrants",
                type: "nvarchar(30)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "status",
                table: "PendingGrants",
                type: "nvarchar(30)",
                nullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "InvestedSum",
                table: "PendingGrants");

            migrationBuilder.DropColumn(
                name: "status",
                table: "PendingGrants");
        }
    }
}
