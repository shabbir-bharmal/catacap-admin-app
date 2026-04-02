using Invest.Core.Dtos;
using Invest.Core.Models;
using Invest.Repo.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace Invest.Controllers.Admin
{
    [Route("api/module-access-permission")]
    [ApiController]
    public class ModuleAccessPermissionController : ControllerBase
    {
        private readonly RepositoryContext _context;

        public ModuleAccessPermissionController (RepositoryContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<IActionResult> GetAll()
        {
            var dashboardModule = await _context.Module
                                                .Where(x => x.Name == "dashboard")
                                                .Select(x => new { x.Id, x.Name })
                                                .FirstOrDefaultAsync();

            var roles = await _context.Roles
                                      .Select(role => new RolePermissionDto
                                      {
                                          RoleId = role.Id,
                                          RoleName = role.Name!,
                                          IsSuperAdmin = role.IsSuperAdmin,
                                          Permissions = role.IsSuperAdmin
                                                          ? new List<RolePermissionItemDto>()
                                                          : _context.ModuleAccessPermission
                                                              .Where(p => p.RoleId == role.Id)
                                                              .Include(p => p.Module)
                                                              .Select(p => new RolePermissionItemDto
                                                              {
                                                                  ModuleId = p.ModuleId,
                                                                  ModuleName = p.Module!.Name!,
                                                                  IsManage = p.Manage,
                                                                  IsDelete = p.Delete
                                                              }).ToList()
                                      })
                                      .ToListAsync();

            foreach (var role in roles)
            {
                if (!role.IsSuperAdmin && dashboardModule != null)
                {
                    var dashboardExists = role.Permissions
                                              .Any(x => x.ModuleId == dashboardModule.Id);

                    if (!dashboardExists)
                    {
                        role.Permissions.Add(new RolePermissionItemDto
                        {
                            ModuleId = dashboardModule.Id,
                            ModuleName = dashboardModule.Name,
                            IsManage = true,
                            IsDelete = false
                        });
                    }
                }
            }

            return Ok(roles);
        }

        [HttpGet("role")]
        public async Task<IActionResult> GetAllRoles()
        {
            var data = await _context.Roles
                                     .Select(x => new RoleDto
                                     {
                                         Id = x.Id,
                                         Name = x.Name
                                     })
                                     .ToListAsync();

            return Ok(data);
        }

        [HttpGet("module")]
        public async Task<IActionResult> GetAllModule()
        {
            var data = await _context.Module
                                     .Select(x => new ModuleDto
                                     {
                                         Id = x.Id,
                                         Name = x.Name,
                                         Category = x.Category,
                                         SortOrder = x.SortOrder
                                     })
                                     .ToListAsync();

            return Ok(data);
        }

        [HttpGet("{roleId}")]
        public async Task<IActionResult> GetByRole(string roleId)
        {
            if (string.IsNullOrWhiteSpace(roleId))
                return Ok(new { Success = false, Message = "RoleId is required." });

            var role = await _context.Roles
                                     .Where(x => x.Id == roleId)
                                     .Select(x => new
                                     {
                                         x.Id,
                                         x.Name,
                                         x.IsSuperAdmin
                                     })
                                     .FirstOrDefaultAsync();

            if (role == null)
                return Ok(new { Success = false, Message = "Role not found." });

            var permissions = await _context.ModuleAccessPermission
                                            .Include(x => x.Module)
                                            .Where(x => x.RoleId == roleId)
                                            .Select(x => new RolePermissionItemDto
                                            {
                                                ModuleId = x.ModuleId,
                                                ModuleName = x.Module!.Name,
                                                IsManage = x.Manage,
                                                IsDelete = x.Delete
                                            })
                                            .ToListAsync();

            var response = new RolePermissionDto
            {
                RoleId = role.Id,
                RoleName = role.Name!,
                IsSuperAdmin = role.IsSuperAdmin,
                Permissions = permissions
            };

            return Ok(response);
        }

        [HttpPost]
        public async Task<IActionResult> SaveRoleWithPermissions([FromBody] RolePermissionDto request)
        {
            if (string.IsNullOrWhiteSpace(request.RoleName))
                return Ok(new { Success = false, Message = "Role name is required." });

            var identity = HttpContext.User.Identity as ClaimsIdentity;
            var userId = identity?.Claims.FirstOrDefault(i => i.Type == "id")?.Value;

            using var transaction = await _context.Database.BeginTransactionAsync();

            try
            {
                ApplicationRole? role;

                if (!string.IsNullOrWhiteSpace(request.RoleId))
                {
                    role = await _context.Roles.FirstOrDefaultAsync(x => x.Id == request.RoleId);

                    if (role == null)
                        return Ok(new { Success = false, Message = "Role not found." });

                    var duplicateExists = await _context.Roles.AnyAsync(x => x.Name == request.RoleName && x.Id != request.RoleId);

                    if (duplicateExists)
                        return Ok(new { Success = false, Message = "Role name already exists." });

                    role.Name = request.RoleName;
                    role.NormalizedName = request.RoleName.ToUpper();
                    role.IsSuperAdmin = request.IsSuperAdmin;

                    _context.Roles.Update(role);
                }
                else
                {
                    var exists = await _context.Roles.AnyAsync(x => x.Name == request.RoleName);

                    if (exists)
                        return Ok(new { Success = false, Message = "Role already exists." });

                    role = new ApplicationRole
                    {
                        Name = request.RoleName,
                        NormalizedName = request.RoleName.ToUpper(),
                        IsSuperAdmin = request.IsSuperAdmin
                    };

                    _context.Roles.Add(role);
                    await _context.SaveChangesAsync();
                }

                await _context.SaveChangesAsync();

                var oldPermissions = await _context.ModuleAccessPermission
                                                   .Where(x => x.RoleId == role.Id)
                                                   .ToListAsync();

                if (oldPermissions.Any())
                    _context.ModuleAccessPermission.RemoveRange(oldPermissions);

                await _context.SaveChangesAsync();

                if (request.IsSuperAdmin)
                {
                    await transaction.CommitAsync();

                    return Ok(new
                    {
                        Success = true,
                        Message = string.IsNullOrWhiteSpace(request.RoleId)
                                    ? "Super Admin permissions assigned successfully."
                                    : "Super Admin permissions updated successfully.",
                        Data = role.Id
                    });
                }

                foreach (var item in request.Permissions)
                {
                    var moduleExists = await _context.Module.AnyAsync(x => x.Id == item.ModuleId);

                    if (!moduleExists)
                        continue;

                    var existingPermission = await _context.ModuleAccessPermission
                                                            .FirstOrDefaultAsync(x =>
                                                                x.RoleId == role.Id &&
                                                                x.ModuleId == item.ModuleId);

                    if (existingPermission != null)
                    {
                        existingPermission.Manage = item.IsManage;
                        existingPermission.Delete = item.IsDelete;
                        existingPermission.UpdatedAt = DateTime.Now;
                        existingPermission.UpdatedBy = userId!;
                    }
                    else
                    {
                        var newPermission = new ModuleAccessPermission
                        {
                            RoleId = role.Id,
                            ModuleId = item.ModuleId,
                            Manage = item.IsManage,
                            Delete = item.IsDelete,
                            CreatedAt = DateTime.Now,
                            UpdatedBy = userId!
                        };

                        _context.ModuleAccessPermission.Add(newPermission);
                    }
                }

                var dashboardModuleId = await _context.Module
                                                      .Where(x => x.Name == "dashboard")
                                                      .Select(x => x.Id)
                                                      .FirstOrDefaultAsync();

                var dashboardPermission = await _context.ModuleAccessPermission
                                                        .FirstOrDefaultAsync(x =>
                                                            x.RoleId == role.Id &&
                                                            x.ModuleId == dashboardModuleId);

                if (dashboardPermission == null)
                {
                    _context.ModuleAccessPermission.Add(new ModuleAccessPermission
                    {
                        RoleId = role.Id,
                        ModuleId = dashboardModuleId,
                        Manage = true,
                        Delete = false,
                        CreatedAt = DateTime.Now,
                        UpdatedBy = userId!
                    });
                }

                await _context.SaveChangesAsync();
                await transaction.CommitAsync();

                return Ok(new
                {
                    Success = true,
                    Message = string.IsNullOrWhiteSpace(request.RoleId)
                                ? "Permissions assigned successfully."
                                : "Permissions updated successfully.",
                    Data = role.Id
                });
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                return BadRequest(new { Success = false, Message = ex.Message });
            }
        }

        [HttpDelete("{roleId}")]
        public async Task<IActionResult> Delete(string roleId)
        {
            var role = await _context.Roles.FirstOrDefaultAsync(x => x.Id == roleId);

            if (role == null)
                return Ok(new { Success = false, Message = "Role not found." });

            var permissions = await _context.ModuleAccessPermission
                                            .Where(x => x.RoleId == roleId)
                                            .ToListAsync();

            if (permissions.Any())
                _context.ModuleAccessPermission.RemoveRange(permissions);

            _context.Roles.Remove(role);
            await _context.SaveChangesAsync();

            return Ok(new { Success = true, Message = "Role and related permissions deleted successfully." });
        }
    }
}
