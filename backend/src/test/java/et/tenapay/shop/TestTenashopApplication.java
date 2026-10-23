package et.tenapay.shop;

import org.springframework.boot.SpringApplication;

public class TestTenashopApplication {

	public static void main(String[] args) {
		SpringApplication.from(TenashopApplication::main).with(TestcontainersConfiguration.class).run(args);
	}

}
