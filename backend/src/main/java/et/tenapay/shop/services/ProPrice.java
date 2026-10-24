package et.tenapay.shop.services;

import java.math.BigDecimal;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** One line of a pro's price list, e.g. "Install a socket, from 300 ETB". */
@Entity
@Table(name = "pro_prices")
@Getter
@Setter
@NoArgsConstructor
public class ProPrice {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	private Long proId;

	private String label;

	/** Null means "ask for a quote". */
	private BigDecimal priceFrom;

	private int position;
}
