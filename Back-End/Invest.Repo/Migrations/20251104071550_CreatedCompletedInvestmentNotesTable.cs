using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Invest.Repo.Migrations
{
    public partial class CreatedCompletedInvestmentNotesTable : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "ModifiedOn",
                table: "CompletedInvestmentsDetails",
                type: "datetime",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "CompletedInvestmentNotes",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    CompletedInvestmentId = table.Column<int>(type: "int", nullable: true),
                    Note = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    CreatedBy = table.Column<string>(type: "nvarchar(450)", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "date", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CompletedInvestmentNotes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CompletedInvestmentNotes_AspNetUsers_CreatedBy",
                        column: x => x.CreatedBy,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_CompletedInvestmentNotes_CompletedInvestmentsDetails_CompletedInvestmentId",
                        column: x => x.CompletedInvestmentId,
                        principalTable: "CompletedInvestmentsDetails",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_CompletedInvestmentNotes_CompletedInvestmentId",
                table: "CompletedInvestmentNotes",
                column: "CompletedInvestmentId");

            migrationBuilder.CreateIndex(
                name: "IX_CompletedInvestmentNotes_CreatedBy",
                table: "CompletedInvestmentNotes",
                column: "CreatedBy");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CompletedInvestmentNotes");

            migrationBuilder.DropColumn(
                name: "ModifiedOn",
                table: "CompletedInvestmentsDetails");
        }
    }
}
