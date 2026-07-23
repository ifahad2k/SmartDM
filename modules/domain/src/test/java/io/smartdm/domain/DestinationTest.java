package io.smartdm.domain;

import org.junit.jupiter.api.Test;
import java.io.ByteArrayOutputStream;
import java.io.ObjectOutputStream;
import java.io.ByteArrayInputStream;
import java.io.ObjectInputStream;
import java.io.Serializable;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DestinationTest {

    @Test
    void acceptsWindowsDrivePaths() {
        Destination dest = Destination.of("C:\\Users\\Bob\\Downloads\\file.txt");
        assertThat(dest.value()).isEqualTo("C:\\Users\\Bob\\Downloads\\file.txt");
    }

    @Test
    void acceptsUncPaths() {
        Destination dest = Destination.of("\\\\Server\\Share\\path\\file.txt");
        assertThat(dest.value()).isEqualTo("\\\\Server\\Share\\path\\file.txt");
    }

    @Test
    void acceptsLinuxPaths() {
        Destination dest = Destination.of("/home/bob/downloads/file.txt");
        assertThat(dest.value()).isEqualTo("/home/bob/downloads/file.txt");
    }

    @Test
    void acceptsUnicodeAndSpaces() {
        Destination dest = Destination.of("/home/bob/My Downloads/\u3053\u3093\u306B\u3061\u306F.txt");
        assertThat(dest.value()).isEqualTo("/home/bob/My Downloads/\u3053\u3093\u306B\u3061\u306F.txt");
    }

    @Test
    void rejectsPathTraversal() {
        assertThatThrownBy(() -> Destination.of("/home/bob/../downloads"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Path traversal is not allowed");
                
        assertThatThrownBy(() -> Destination.of("C:\\Users\\..\\Bob"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Path traversal is not allowed");
    }
    
    @Test
    void serializesAndDeserializes() throws Exception {
        Destination dest = Destination.of("/valid/path");
        
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        ObjectOutputStream oos = new ObjectOutputStream(baos);
        oos.writeObject(dest);
        oos.close();
        
        ByteArrayInputStream bais = new ByteArrayInputStream(baos.toByteArray());
        ObjectInputStream ois = new ObjectInputStream(bais);
        Destination deserialized = (Destination) ois.readObject();
        
        assertThat(deserialized.value()).isEqualTo("/valid/path");
    }
}
