using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Invest.Repo.Migrations
{
    public partial class CreatedCountryTable : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SDGs",
                table: "Groups");

            migrationBuilder.DropColumn(
                name: "Themes",
                table: "Groups");

            migrationBuilder.CreateTable(
                name: "Country",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Name = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    SortOrder = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Country", x => x.Id);
                });

            migrationBuilder.InsertData(
                table: "Country",
                columns: new[] { "Id", "IsActive", "Name", "SortOrder" },
                values: new object[,]
                {
                    { 1, true, "USA", 1 },
                    { 2, true, "Argentina", 2 },
                    { 3, true, "Australia", 2 },
                    { 4, true, "Austria", 2 },
                    { 5, true, "Belgium", 2 },
                    { 6, true, "Belize", 2 },
                    { 7, true, "Brazil", 2 },
                    { 8, true, "Bulgaria", 2 },
                    { 9, true, "Canada", 2 },
                    { 10, true, "Chile", 2 },
                    { 11, true, "China", 2 },
                    { 12, true, "Colombia", 2 },
                    { 13, true, "Costa Rica", 2 },
                    { 14, true, "Czechia (Czech Republic)", 2 },
                    { 15, true, "Denmark", 2 },
                    { 16, true, "Finland", 2 },
                    { 17, true, "France", 2 },
                    { 18, true, "Germany", 2 },
                    { 19, true, "Greece", 2 },
                    { 20, true, "Hungary", 2 },
                    { 21, true, "Iceland", 2 },
                    { 22, true, "India", 2 },
                    { 23, true, "Indonesia", 2 },
                    { 24, true, "Ireland", 2 },
                    { 25, true, "Israel", 2 },
                    { 26, true, "Italy", 2 },
                    { 27, true, "Japan", 2 },
                    { 28, true, "Mexico", 2 },
                    { 29, true, "Netherlands", 2 },
                    { 30, true, "New Zealand", 2 },
                    { 31, true, "Norway", 2 },
                    { 32, true, "Peru", 2 },
                    { 33, true, "Philippines", 2 },
                    { 34, true, "Poland", 2 },
                    { 35, true, "Portugal", 2 },
                    { 36, true, "Romania", 2 },
                    { 37, true, "Russia", 2 },
                    { 38, true, "Singapore", 2 },
                    { 39, true, "South Africa", 2 },
                    { 40, true, "Spain", 2 },
                    { 41, true, "Sweden", 2 },
                    { 42, true, "Switzerland", 2 }
                });

            migrationBuilder.InsertData(
                table: "Country",
                columns: new[] { "Id", "IsActive", "Name", "SortOrder" },
                values: new object[] { 43, true, "United Kingdom", 2 });
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Country");

            migrationBuilder.AddColumn<string>(
                name: "SDGs",
                table: "Groups",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Themes",
                table: "Groups",
                type: "nvarchar(max)",
                nullable: true);
        }
    }
}
