using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Invest.Repo.Migrations
{
    public partial class CreatedReturnMasterAndReturnDetailsTables : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ReturnMasters",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    CampaignId = table.Column<int>(type: "int", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    ReturnAmount = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    TotalInvestors = table.Column<int>(type: "int", nullable: true),
                    TotalInvestmentAmount = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    MemoNote = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Status = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    PrivateDebtStartDate = table.Column<DateTime>(type: "date", nullable: true),
                    PrivateDebtEndDate = table.Column<DateTime>(type: "date", nullable: true),
                    PostDate = table.Column<DateTime>(type: "date", nullable: false),
                    CreatedOn = table.Column<DateTime>(type: "datetime", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ReturnMasters", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ReturnMasters_AspNetUsers_CreatedBy",
                        column: x => x.CreatedBy,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ReturnMasters_Campaigns_CampaignId",
                        column: x => x.CampaignId,
                        principalTable: "Campaigns",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ReturnDetails",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    ReturnMasterId = table.Column<int>(type: "int", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    InvestmentAmount = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    PercentageOfTotalInvestment = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    ReturnAmount = table.Column<decimal>(type: "decimal(18,2)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ReturnDetails", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ReturnDetails_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ReturnDetails_ReturnMasters_ReturnMasterId",
                        column: x => x.ReturnMasterId,
                        principalTable: "ReturnMasters",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ReturnDetails_ReturnMasterId",
                table: "ReturnDetails",
                column: "ReturnMasterId");

            migrationBuilder.CreateIndex(
                name: "IX_ReturnDetails_UserId",
                table: "ReturnDetails",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_ReturnMasters_CampaignId",
                table: "ReturnMasters",
                column: "CampaignId");

            migrationBuilder.CreateIndex(
                name: "IX_ReturnMasters_CreatedBy",
                table: "ReturnMasters",
                column: "CreatedBy");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ReturnDetails");

            migrationBuilder.DropTable(
                name: "ReturnMasters");
        }
    }
}
