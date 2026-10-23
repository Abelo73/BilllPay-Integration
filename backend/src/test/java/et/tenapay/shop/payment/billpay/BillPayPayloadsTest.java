package et.tenapay.shop.payment.billpay;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;

import org.junit.jupiter.api.Test;

import et.tenapay.shop.payment.PaymentStatus;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

class BillPayPayloadsTest {

	private final ObjectMapper json = JsonMapper.builder().build();

	private BillPayPayment parse(String body) {
		return BillPayPayloads.parsePayment(json.readTree(body), body);
	}

	@Test
	void unwrapsBillPayEnvelope() {
		BillPayPayment p = parse("""
				{"statusCode":200,"message":"Payment created","body":{
				  "id":"pay_123","merchantReference":"TS-20261022-00001-A1",
				  "checkoutUrl":"https://sandbox.checkout.billpay.et/c/pay_123","status":"PENDING",
				  "amount":1450.00,"currency":"ETB","expiresAt":"2026-10-22T18:38:18Z"},
				 "timestamp":"2026-10-22T18:08:18.400+00:00"}
				""");
		assertThat(p.paymentId()).isEqualTo("pay_123");
		assertThat(p.merchantReference()).isEqualTo("TS-20261022-00001-A1");
		assertThat(p.checkoutUrl()).endsWith("/c/pay_123");
		assertThat(p.status()).isEqualTo("PENDING");
		assertThat(p.amount()).isEqualByComparingTo(new BigDecimal("1450.00"));
		assertThat(p.expiresAt()).isNotNull();
	}

	@Test
	void readsWebhookWithNestedPayment() {
		BillPayPayment p = parse("""
				{"id":"evt_9","event":"payment.failed","data":{"payment":{
				  "paymentId":"pay_9","status":"REFUSED","reasonCode":"INSUFFICIENT_FUNDS","amount":"10.00"}}}
				""");
		assertThat(p.paymentId()).isEqualTo("pay_9");
		assertThat(p.reasonCode()).isEqualTo("INSUFFICIENT_FUNDS");
		assertThat(p.amount()).isEqualByComparingTo("10.00");
		assertThat(PaymentStatus.fromBillPay(p.status())).isEqualTo(PaymentStatus.FAILED);
	}

	@Test
	void routesEventsByType() {
		assertThat(BillPayPayloads.kind("payment.captured", null)).isEqualTo(BillPayPayloads.EventKind.PAYMENT);
		assertThat(BillPayPayloads.kind("payment.refunded", null)).isEqualTo(BillPayPayloads.EventKind.REFUND);
		assertThat(BillPayPayloads.kind(null, "REFUNDED")).isEqualTo(BillPayPayloads.EventKind.REFUND);
		assertThat(BillPayPayloads.kind("payment.settled", null)).isEqualTo(BillPayPayloads.EventKind.SETTLEMENT);
		assertThat(BillPayPayloads.kind("webhook.test", null)).isEqualTo(BillPayPayloads.EventKind.TEST);
		assertThat(BillPayPayloads.statusFromEventType("payment.captured")).isEqualTo("SUCCEEDED");
		assertThat(BillPayPayloads.statusFromEventType("payment.failed")).isEqualTo("FAILED");
	}

	@Test
	void readsRefundEvent() {
		String body = """
				{"event":"payment.refunded","data":{"refund":{"id":"rf_1","paymentId":"pay_9",
				 "status":"REFUSED","reasonCode":"REFUND_REFUSED","amount":50.13}}}
				""";
		BillPayRefund r = BillPayPayloads.parseRefund(json.readTree(body), body);
		assertThat(r.refundId()).isEqualTo("rf_1");
		assertThat(r.paymentId()).isEqualTo("pay_9");
		assertThat(et.tenapay.shop.refund.RefundStatus.fromBillPay(r.status()))
				.isEqualTo(et.tenapay.shop.refund.RefundStatus.REFUSED);
		assertThat(r.amount()).isEqualByComparingTo("50.13");
	}

	@Test
	void mapsStatusSynonyms() {
		assertThat(PaymentStatus.fromBillPay("paid")).isEqualTo(PaymentStatus.SUCCEEDED);
		assertThat(PaymentStatus.fromBillPay("Canceled")).isEqualTo(PaymentStatus.CANCELLED);
		assertThat(PaymentStatus.fromBillPay("processing")).isEqualTo(PaymentStatus.PENDING);
		assertThat(PaymentStatus.fromBillPay("something-new")).isNull();
	}
}
