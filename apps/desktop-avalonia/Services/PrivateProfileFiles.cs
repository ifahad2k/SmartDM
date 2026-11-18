using System;
using System.IO;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;

namespace SmartDm.Desktop.Avalonia.Services;

public static class PrivateProfileFiles
{
    public static void Write(string path, byte[] bytes)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        string pending = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            var options = new FileStreamOptions {Mode = FileMode.CreateNew, Access = FileAccess.Write, Share = FileShare.None};
            if (!OperatingSystem.IsWindows()) options.UnixCreateMode = UnixFileMode.UserRead | UnixFileMode.UserWrite;
            using (var output = new FileStream(pending, options))
            {
                if (OperatingSystem.IsWindows())
                {
                    var sid = WindowsIdentity.GetCurrent().User ?? throw new IOException("Cannot identify the profile owner.");
                    var acl = new FileSecurity();
                    acl.SetOwner(sid);
                    acl.SetAccessRuleProtection(true, false);
                    acl.AddAccessRule(new FileSystemAccessRule(sid, FileSystemRights.FullControl, AccessControlType.Allow));
                    new FileInfo(pending).SetAccessControl(acl);
                }
                output.Write(bytes); output.Flush(true);
            }
            File.Move(pending, path, true);
        }
        finally { if (File.Exists(pending)) File.Delete(pending); }
    }

    public static void WriteText(string path, string text) => Write(path, Encoding.UTF8.GetBytes(text));
}
