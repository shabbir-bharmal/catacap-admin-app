using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Invest.Repo.Migrations
{
    public partial class AddPrivateInvestments : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "GroupForPrivateAccessId",
                table: "Campaigns",
                type: "int",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Campaigns_GroupForPrivateAccessId",
                table: "Campaigns",
                column: "GroupForPrivateAccessId");

            migrationBuilder.AddForeignKey(
                name: "FK_Campaigns_Groups_GroupForPrivateAccessId",
                table: "Campaigns",
                column: "GroupForPrivateAccessId",
                principalTable: "Groups",
                principalColumn: "Id");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Campaigns_Groups_GroupForPrivateAccessId",
                table: "Campaigns");

            migrationBuilder.DropIndex(
                name: "IX_Campaigns_GroupForPrivateAccessId",
                table: "Campaigns");

            migrationBuilder.DropColumn(
                name: "GroupForPrivateAccessId",
                table: "Campaigns");
        }
    }
}
