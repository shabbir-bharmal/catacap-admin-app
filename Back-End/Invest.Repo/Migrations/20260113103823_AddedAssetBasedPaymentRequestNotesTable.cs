using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Invest.Repo.Migrations
{
    public partial class AddedAssetBasedPaymentRequestNotesTable : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ChangeLogId",
                table: "AssetBasedPaymentRequest");

            migrationBuilder.AddColumn<int>(
                name: "AssetBasedPaymentRequestId",
                table: "AccountBalanceChangeLogs",
                type: "int",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "AssetBasedPaymentRequestNotes",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    RequestId = table.Column<int>(type: "int", nullable: false),
                    Note = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    OldStatus = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    NewStatus = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    CreatedBy = table.Column<string>(type: "nvarchar(450)", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "date", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AssetBasedPaymentRequestNotes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AssetBasedPaymentRequestNotes_AspNetUsers_CreatedBy",
                        column: x => x.CreatedBy,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_AssetBasedPaymentRequestNotes_AssetBasedPaymentRequest_RequestId",
                        column: x => x.RequestId,
                        principalTable: "AssetBasedPaymentRequest",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AccountBalanceChangeLogs_AssetBasedPaymentRequestId",
                table: "AccountBalanceChangeLogs",
                column: "AssetBasedPaymentRequestId");

            migrationBuilder.CreateIndex(
                name: "IX_AssetBasedPaymentRequestNotes_CreatedBy",
                table: "AssetBasedPaymentRequestNotes",
                column: "CreatedBy");

            migrationBuilder.CreateIndex(
                name: "IX_AssetBasedPaymentRequestNotes_RequestId",
                table: "AssetBasedPaymentRequestNotes",
                column: "RequestId");

            migrationBuilder.AddForeignKey(
                name: "FK_AccountBalanceChangeLogs_AssetBasedPaymentRequest_AssetBasedPaymentRequestId",
                table: "AccountBalanceChangeLogs",
                column: "AssetBasedPaymentRequestId",
                principalTable: "AssetBasedPaymentRequest",
                principalColumn: "Id");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_AccountBalanceChangeLogs_AssetBasedPaymentRequest_AssetBasedPaymentRequestId",
                table: "AccountBalanceChangeLogs");

            migrationBuilder.DropTable(
                name: "AssetBasedPaymentRequestNotes");

            migrationBuilder.DropIndex(
                name: "IX_AccountBalanceChangeLogs_AssetBasedPaymentRequestId",
                table: "AccountBalanceChangeLogs");

            migrationBuilder.DropColumn(
                name: "AssetBasedPaymentRequestId",
                table: "AccountBalanceChangeLogs");

            migrationBuilder.AddColumn<int>(
                name: "ChangeLogId",
                table: "AssetBasedPaymentRequest",
                type: "int",
                nullable: true);
        }
    }
}
