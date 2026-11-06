using System.Reflection;
using Xunit;

namespace SmartDm.Architecture.Tests;

public class ArchitectureTests
{
    private static readonly string[] ForbiddenDomainAssemblyPrefixes =
    [
        "Avalonia",
        "Microsoft.Data.Sqlite",
        "System.Net.Http",
        "System.Data"
    ];

    [Fact]
    public void Domain_MustNotReferenceForbiddenAssemblies()
    {
        Assembly domainAssembly = typeof(SmartDm.Domain.TransferCredentials).Assembly;
        AssemblyName[] referencedAssemblies = domainAssembly.GetReferencedAssemblies();

        var violations = referencedAssemblies
            .Where(r => ForbiddenDomainAssemblyPrefixes.Any(prefix =>
                r.Name != null && (r.Name == prefix || r.Name.StartsWith(prefix + ".", StringComparison.OrdinalIgnoreCase))))
            .Select(r => r.Name)
            .ToList();

        Assert.Empty(violations);
    }

    [Fact]
    public void Domain_TypesMustNotReferenceForbiddenNamespaces()
    {
        Assembly domainAssembly = typeof(SmartDm.Domain.TransferCredentials).Assembly;
        Type[] domainTypes = domainAssembly.GetTypes();

        List<string> violations = FindForbiddenTypeViolations(domainTypes, IsForbiddenDomainType);
        Assert.Empty(violations);
    }

    [Fact]
    public void ProductionAvalonia_ViewModels_MustNotDependOnRawSqlite()
    {
        Assembly avaloniaAssembly = typeof(SmartDm.Desktop.Avalonia.ViewModels.MainViewModel).Assembly;
        Type[] vmTypes = avaloniaAssembly.GetTypes()
            .Where(t => t.Namespace != null && t.Namespace.StartsWith("SmartDm.Desktop.Avalonia.ViewModels"))
            .ToArray();

        List<string> violations = FindForbiddenTypeViolations(vmTypes, t =>
            t.Namespace != null && t.Namespace.StartsWith("Microsoft.Data.Sqlite", StringComparison.OrdinalIgnoreCase));

        Assert.Empty(violations);
    }

    [Fact]
    public void ProductionAvalonia_Services_MustNotDependOnUIControls()
    {
        Assembly avaloniaAssembly = typeof(SmartDm.Desktop.Avalonia.Services.DownloadEngine).Assembly;
        Type[] serviceTypes = avaloniaAssembly.GetTypes()
            .Where(t => t.Namespace != null && t.Namespace.StartsWith("SmartDm.Desktop.Avalonia.Services"))
            .ToArray();

        List<string> violations = FindForbiddenTypeViolations(serviceTypes, t =>
            t.Namespace != null && t.Namespace.StartsWith("Avalonia.Controls", StringComparison.OrdinalIgnoreCase));

        Assert.Empty(violations);
    }

    [Fact]
    public void ProductionAvalonia_Models_MustNotDependOnUIControls()
    {
        Assembly avaloniaAssembly = typeof(SmartDm.Desktop.Avalonia.Models.DownloadModel).Assembly;
        Type[] modelTypes = avaloniaAssembly.GetTypes()
            .Where(t => t.Namespace != null && t.Namespace.StartsWith("SmartDm.Desktop.Avalonia.Models"))
            .ToArray();

        List<string> violations = FindForbiddenTypeViolations(modelTypes, t =>
            t.Namespace != null && (t.Namespace.StartsWith("Avalonia.Controls", StringComparison.OrdinalIgnoreCase) ||
                                   t.Namespace.StartsWith("Avalonia.Visual", StringComparison.OrdinalIgnoreCase)));

        Assert.Empty(violations);
    }

    [Fact]
    public void ProductionAvalonia_Views_MustNotDependOnRawSqlite()
    {
        Assembly avaloniaAssembly = typeof(SmartDm.Desktop.Avalonia.Views.MainWindow).Assembly;
        Type[] viewTypes = avaloniaAssembly.GetTypes()
            .Where(t => t.Namespace != null && t.Namespace.StartsWith("SmartDm.Desktop.Avalonia.Views"))
            .ToArray();

        List<string> violations = FindForbiddenTypeViolations(viewTypes, t =>
            t.Namespace != null && t.Namespace.StartsWith("Microsoft.Data.Sqlite", StringComparison.OrdinalIgnoreCase));

        Assert.Empty(violations);
    }

    [Fact]
    public void ArchitectureEnforcement_MustFailWhenForbiddenDependencyExists()
    {
        // Negative test: verify that a domain type with a deliberately forbidden dependency fails validation
        Type[] sampleViolatingTypes = [typeof(DeliberatelyForbiddenDomainSample)];
        List<string> violations = FindForbiddenTypeViolations(sampleViolatingTypes, IsForbiddenDomainType);

        Assert.NotEmpty(violations);
        Assert.Contains(violations, v => v.Contains("System.Net.Http.HttpClient"));
    }

    [Fact]
    public void ProductionAvalonia_ArchitectureEnforcement_MustFailWhenViewModelDirectlyReferencesSqlite()
    {
        // Negative test: verify that a ViewModel directly referencing Microsoft.Data.Sqlite fails enforcement
        Type[] sampleViolatingVmTypes = [typeof(DeliberatelyForbiddenViewModelSample)];
        List<string> violations = FindForbiddenTypeViolations(sampleViolatingVmTypes, t =>
            t.Namespace != null && t.Namespace.StartsWith("Microsoft.Data.Sqlite", StringComparison.OrdinalIgnoreCase));

        Assert.NotEmpty(violations);
        Assert.Contains(violations, v => v.Contains("Microsoft.Data.Sqlite.SqliteConnection"));
    }

    private static List<string> FindForbiddenTypeViolations(IEnumerable<Type> types, Func<Type, bool> isForbidden)
    {
        List<string> violations = [];
        foreach (Type type in types)
        {
            foreach (FieldInfo field in type.GetFields(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static))
            {
                if (isForbidden(field.FieldType))
                    violations.Add($"{type.FullName}.{field.Name} references {field.FieldType.FullName}");
            }

            foreach (PropertyInfo prop in type.GetProperties(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static))
            {
                if (isForbidden(prop.PropertyType))
                    violations.Add($"{type.FullName}.{prop.Name} references {prop.PropertyType.FullName}");
            }

            foreach (MethodInfo method in type.GetMethods(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly))
            {
                if (isForbidden(method.ReturnType))
                    violations.Add($"{type.FullName}.{method.Name}() returns {method.ReturnType.FullName}");

                foreach (ParameterInfo param in method.GetParameters())
                {
                    if (isForbidden(param.ParameterType))
                        violations.Add($"{type.FullName}.{method.Name}({param.Name}) uses {param.ParameterType.FullName}");
                }
            }
        }
        return violations;
    }

    private static bool IsForbiddenDomainType(Type type)
    {
        string? ns = type.Namespace;
        if (string.IsNullOrEmpty(ns)) return false;

        return ns.StartsWith("Avalonia", StringComparison.OrdinalIgnoreCase) ||
               ns.StartsWith("Microsoft.Data.Sqlite", StringComparison.OrdinalIgnoreCase) ||
               ns.StartsWith("System.Net.Http", StringComparison.OrdinalIgnoreCase);
    }

    private sealed class DeliberatelyForbiddenDomainSample
    {
        public System.Net.Http.HttpClient? ForbiddenHttp { get; set; }
    }

    private sealed class DeliberatelyForbiddenViewModelSample
    {
        public Microsoft.Data.Sqlite.SqliteConnection? DirectConnection { get; set; }
    }
}
