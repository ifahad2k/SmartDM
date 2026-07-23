import io.smartdm.organization.SmartFolderService;
import io.smartdm.catalog.SqlCipherCatalogRepository;
import io.smartdm.organization.SqliteFolderAffinityRepository;
import io.smartdm.catalog.SqliteCategoryRepository;
import java.util.List;
import io.smartdm.domain.organization.FolderSuggestion;

public class TestService {
    public static void main(String[] args) {
        try {
            SqliteCategoryRepository catRepo = new SqliteCategoryRepository("jdbc:sqlite:C:\\Users\\ifaha\\AppData\\Local\\SmartDM\\Data\\smartdm.db", "password");
            SqlCipherCatalogRepository catlogRepo = new SqlCipherCatalogRepository("jdbc:sqlite:C:\\Users\\ifaha\\AppData\\Local\\SmartDM\\Data\\smartdm.db", "password");
            SqliteFolderAffinityRepository affRepo = new SqliteFolderAffinityRepository("jdbc:sqlite:C:\\Users\\ifaha\\AppData\\Local\\SmartDM\\Data\\smartdm.db", "password");
            SmartFolderService service = new SmartFolderService(catRepo, catlogRepo, affRepo);
            
            List<FolderSuggestion> suggestions = service.suggestFolders(
                "http://ipv4.download.thinkbroadband.com/512MB.zip",
                "512MB.zip",
                null,
                536870912L
            );
            System.out.println("Size: " + suggestions.size());
            for (FolderSuggestion s : suggestions) {
                System.out.println(" - " + s.displayName() + " " + s.score() + " " + s.reason());
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
