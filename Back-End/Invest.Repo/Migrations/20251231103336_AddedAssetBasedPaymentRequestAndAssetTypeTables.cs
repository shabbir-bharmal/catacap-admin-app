using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Invest.Repo.Migrations
{
    public partial class AddedAssetBasedPaymentRequestAndAssetTypeTables : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AssetType",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Type = table.Column<string>(type: "nvarchar(max)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AssetType", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "AssetBasedPaymentRequest",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    UserId = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    CampaignId = table.Column<int>(type: "int", nullable: true),
                    AssetTypeId = table.Column<int>(type: "int", nullable: false),
                    AssetDescription = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ApproximateAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    ReceivedAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    ContactMethod = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ContactValue = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Status = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ChangeLogId = table.Column<int>(type: "int", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime", nullable: true),
                    UpdatedBy = table.Column<string>(type: "nvarchar(450)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AssetBasedPaymentRequest", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AssetBasedPaymentRequest_AspNetUsers_UpdatedBy",
                        column: x => x.UpdatedBy,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_AssetBasedPaymentRequest_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_AssetBasedPaymentRequest_AssetType_AssetTypeId",
                        column: x => x.AssetTypeId,
                        principalTable: "AssetType",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_AssetBasedPaymentRequest_Campaigns_CampaignId",
                        column: x => x.CampaignId,
                        principalTable: "Campaigns",
                        principalColumn: "Id");
                });

            migrationBuilder.InsertData(
                table: "AssetType",
                columns: new[] { "Id", "Type" },
                values: new object[,]
                {
                    { 1, "Cryptocurrency" },
                    { 2, "Real estate" },
                    { 3, "Stock" },
                    { 4, "Other" }
                });

            migrationBuilder.CreateIndex(
                name: "IX_AssetBasedPaymentRequest_AssetTypeId",
                table: "AssetBasedPaymentRequest",
                column: "AssetTypeId");

            migrationBuilder.CreateIndex(
                name: "IX_AssetBasedPaymentRequest_CampaignId",
                table: "AssetBasedPaymentRequest",
                column: "CampaignId");

            migrationBuilder.CreateIndex(
                name: "IX_AssetBasedPaymentRequest_UpdatedBy",
                table: "AssetBasedPaymentRequest",
                column: "UpdatedBy");

            migrationBuilder.CreateIndex(
                name: "IX_AssetBasedPaymentRequest_UserId",
                table: "AssetBasedPaymentRequest",
                column: "UserId");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AssetBasedPaymentRequest");

            migrationBuilder.DropTable(
                name: "AssetType");
        }
    }
}
