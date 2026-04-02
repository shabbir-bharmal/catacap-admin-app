using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Invest.Repo.Migrations
{
    public partial class CreatedNewsTable : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "News",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Title = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Description = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    NewsTypeId = table.Column<int>(type: "int", nullable: true),
                    AudienceId = table.Column<int>(type: "int", nullable: true),
                    ThemeId = table.Column<int>(type: "int", nullable: true),
                    ImageFileName = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ArticleLink = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Status = table.Column<bool>(type: "bit", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(450)", nullable: true),
                    ModifiedBy = table.Column<string>(type: "nvarchar(450)", nullable: true),
                    ArticalDate = table.Column<DateTime>(type: "date", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime", nullable: false),
                    ModifiedAt = table.Column<DateTime>(type: "datetime", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_News", x => x.Id);
                    table.ForeignKey(
                        name: "FK_News_AspNetUsers_CreatedBy",
                        column: x => x.CreatedBy,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_News_AspNetUsers_ModifiedBy",
                        column: x => x.ModifiedBy,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_News_SiteConfiguration_AudienceId",
                        column: x => x.AudienceId,
                        principalTable: "SiteConfiguration",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_News_SiteConfiguration_NewsTypeId",
                        column: x => x.NewsTypeId,
                        principalTable: "SiteConfiguration",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_News_Themes_ThemeId",
                        column: x => x.ThemeId,
                        principalTable: "Themes",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_News_AudienceId",
                table: "News",
                column: "AudienceId");

            migrationBuilder.CreateIndex(
                name: "IX_News_CreatedBy",
                table: "News",
                column: "CreatedBy");

            migrationBuilder.CreateIndex(
                name: "IX_News_ModifiedBy",
                table: "News",
                column: "ModifiedBy");

            migrationBuilder.CreateIndex(
                name: "IX_News_NewsTypeId",
                table: "News",
                column: "NewsTypeId");

            migrationBuilder.CreateIndex(
                name: "IX_News_ThemeId",
                table: "News",
                column: "ThemeId");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "News");
        }
    }
}
