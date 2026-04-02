using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Invest.Repo.Migrations
{
    public partial class AddApprovedBy : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ApprovedBy",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Name = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ApprovedBy", x => x.Id);
                });

            migrationBuilder.InsertData(
                table: "ApprovedBy",
                columns: new[] { "Id", "Name" },
                values: new object[] { 1, "Impact Assets" });

            migrationBuilder.InsertData(
                table: "ApprovedBy",
                columns: new[] { "Id", "Name" },
                values: new object[] { 2, "Toniic Investors" });
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ApprovedBy");
        }
    }
}
