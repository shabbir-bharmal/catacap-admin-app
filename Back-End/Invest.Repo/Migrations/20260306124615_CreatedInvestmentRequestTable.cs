using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Invest.Repo.Migrations
{
    public partial class CreatedInvestmentRequestTable : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "InvestmentRequest",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    CurrentStep = table.Column<int>(type: "int", nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    Country = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    UserId = table.Column<string>(type: "nvarchar(450)", nullable: true),
                    Website = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    OrganizationName = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    CurrentlyRaising = table.Column<bool>(type: "bit", nullable: false),
                    InvestmentTypes = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    InvestmentThemes = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ThemeDescription = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    CapitalRaised = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ReferenceableInvestors = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    HasDonorCommitment = table.Column<bool>(type: "bit", nullable: false),
                    SoftCircledAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Timeline = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    CampaignGoal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Role = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ReferralSource = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    LogoFileName = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    HeroImageFileName = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    PitchDeckFileName = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    InvestmentTerms = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    WhyBackYourInvestment = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ModifiedBy = table.Column<string>(type: "nvarchar(450)", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime", nullable: false),
                    ModifiedAt = table.Column<DateTime>(type: "datetime", nullable: true),
                    IsDeleted = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InvestmentRequest", x => x.Id);
                    table.ForeignKey(
                        name: "FK_InvestmentRequest_AspNetUsers_ModifiedBy",
                        column: x => x.ModifiedBy,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_InvestmentRequest_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_InvestmentRequest_ModifiedBy",
                table: "InvestmentRequest",
                column: "ModifiedBy");

            migrationBuilder.CreateIndex(
                name: "IX_InvestmentRequest_UserId",
                table: "InvestmentRequest",
                column: "UserId");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "InvestmentRequest");
        }
    }
}
