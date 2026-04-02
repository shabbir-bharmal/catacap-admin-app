using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Invest.Repo.Migrations
{
    public partial class AddColumnToPendingGrants : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "FirstName",
                table: "PendingGrants",
                type: "varchar(100)",
                nullable: true,
                defaultValue: "");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "FirstName",
                table: "PendingGrants");
        }
    }
}
