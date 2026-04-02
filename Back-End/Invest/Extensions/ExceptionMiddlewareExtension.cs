using Microsoft.AspNetCore.Diagnostics;
using Invest.Core.Models;
using Invest.Service.Interfaces;
using System.Net;
using System.Net.Http.Headers;
using Microsoft.EntityFrameworkCore;

namespace Invest.Extensions;

public static class ExceptionMiddlewareExtension
{
    public static void AddDonorboxAuthHeader(this HttpClient client)
    {
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic",
                   Convert.ToBase64String(System.Text.Encoding.ASCII.GetBytes(
                       // TODO MOVE TO CONFIGURATION
                       "ken@impactree.org:xXQe1-WiLeIR04PPgY9cYZiNMETlc38Fq7ecfUI0eRmn80pcwZjK-A")));
    }

    public static void ConfigureExceptionHandler(this IApplicationBuilder app, ILoggerManager logger)
    {
        app.UseExceptionHandler(errorApp =>
        {
            errorApp.Run(async context =>
            {
                var exceptionHandlerPathFeature =
                    context.Features.Get<IExceptionHandlerPathFeature>();

                var exception = exceptionHandlerPathFeature?.Error;

                await context.Response.WriteAsJsonAsync(new
                {
                    error = exception?.Message,
                    stackTrace = exception?.StackTrace
                });
            });
        });
    }

    public static async Task<PagedResult<T>> GetPaged<T>(this IQueryable<T> query,
                                         int page, int pageSize) where T : class
    {
        var result = new PagedResult<T>();
        result.CurrentPage = page;
        result.PageSize = pageSize;

        result.RowCount = query.Count();


        var pageCount = (double)result.RowCount / pageSize;
        result.PageCount = (int)Math.Ceiling(pageCount);

        var skip = (page - 1) * pageSize;
        result.Results = await query.Skip(skip).Take(pageSize).ToListAsync();

        return result;
    }

    public abstract class PagedResultBase
    {
        public int CurrentPage { get; set; }
        public int PageCount { get; set; }
        public int PageSize { get; set; }
        public int RowCount { get; set; }

        public int FirstRowOnPage
        {

            get { return (CurrentPage - 1) * PageSize + 1; }
        }

        public int LastRowOnPage
        {
            get { return Math.Min(CurrentPage * PageSize, RowCount); }
        }
    }

    public class PagedResult<T> : PagedResultBase where T : class
    {
        public List<T> Results { get; set; }

        public PagedResult()
        {
            Results = new List<T>();
        }
    }
}
