using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Invest.Repo.Migrations
{
    public partial class AddedPendingGrantNotesTable : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PendingGrantNotes",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    PendingGrantId = table.Column<int>(type: "int", nullable: true),
                    Note = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    OldStatus = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    NewStatus = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    CreatedBy = table.Column<string>(type: "nvarchar(450)", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "date", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PendingGrantNotes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PendingGrantNotes_AspNetUsers_CreatedBy",
                        column: x => x.CreatedBy,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_PendingGrantNotes_PendingGrants_PendingGrantId",
                        column: x => x.PendingGrantId,
                        principalTable: "PendingGrants",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_PendingGrantNotes_CreatedBy",
                table: "PendingGrantNotes",
                column: "CreatedBy");

            migrationBuilder.CreateIndex(
                name: "IX_PendingGrantNotes_PendingGrantId",
                table: "PendingGrantNotes",
                column: "PendingGrantId");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PendingGrantNotes");
        }
    }
}
