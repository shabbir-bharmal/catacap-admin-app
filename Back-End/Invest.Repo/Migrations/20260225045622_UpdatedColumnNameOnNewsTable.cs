using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Invest.Repo.Migrations
{
    public partial class UpdatedColumnNameOnNewsTable : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "ArticleLink",
                table: "News",
                newName: "NewsLink");

            migrationBuilder.RenameColumn(
                name: "ArticalDate",
                table: "News",
                newName: "NewsDate");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "NewsLink",
                table: "News",
                newName: "ArticleLink");

            migrationBuilder.RenameColumn(
                name: "NewsDate",
                table: "News",
                newName: "ArticalDate");
        }
    }
}
