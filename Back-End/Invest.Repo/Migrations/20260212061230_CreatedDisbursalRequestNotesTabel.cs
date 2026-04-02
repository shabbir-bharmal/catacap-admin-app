using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Invest.Repo.Migrations
{
    public partial class CreatedDisbursalRequestNotesTabel : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "DisbursalRequestNotes",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    DisbursalRequestId = table.Column<int>(type: "int", nullable: true),
                    Note = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    CreatedBy = table.Column<string>(type: "nvarchar(450)", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "date", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DisbursalRequestNotes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DisbursalRequestNotes_AspNetUsers_CreatedBy",
                        column: x => x.CreatedBy,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_DisbursalRequestNotes_DisbursalRequest_DisbursalRequestId",
                        column: x => x.DisbursalRequestId,
                        principalTable: "DisbursalRequest",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_DisbursalRequestNotes_CreatedBy",
                table: "DisbursalRequestNotes",
                column: "CreatedBy");

            migrationBuilder.CreateIndex(
                name: "IX_DisbursalRequestNotes_DisbursalRequestId",
                table: "DisbursalRequestNotes",
                column: "DisbursalRequestId");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DisbursalRequestNotes");
        }
    }
}
