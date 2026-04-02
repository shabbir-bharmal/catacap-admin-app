using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Invest.Repo.Migrations
{
    public partial class UpdatePendingGrantsTableColumnName : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "DeciInvestedSum",
                table: "PendingGrants",
                newName: "TotalInvestedAmount");

            migrationBuilder.RenameColumn(
                name: "DeciAmount",
                table: "PendingGrants",
                newName: "GrantAmount");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "TotalInvestedAmount",
                table: "PendingGrants",
                newName: "DeciInvestedSum");

            migrationBuilder.RenameColumn(
                name: "GrantAmount",
                table: "PendingGrants",
                newName: "DeciAmount");
        }
    }
}
