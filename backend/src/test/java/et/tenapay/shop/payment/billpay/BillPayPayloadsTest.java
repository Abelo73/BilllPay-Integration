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
	void parsesRealSandboxCreateResponse() {
		// Captured from sandbox.api.billpay.et on 2026-10-23 (customer details masked by BillPay)
		BillPayPayment p = parse("""
				{"statusCode":201,"message":"Payment created successfully","body":{
				 "id":"6978e46a-1776-4a7a-81b8-f5c8a91512a5","merchantId":"cb24c910-d2c6-47e8-99de-84d0e84e3ac1",
				 "merchantReference":"KEYTEST-1792747810","status":"CREATED",
				 "amount":{"amount":10.0000,"currency":"ETB"},"charged":{"amount":10.0000,"currency":"ETB"},
				 "fee":{"amount":0.0000,"currency":"ETB"},"refunded":{"amount":0.0000,"currency":"ETB"},
				 "description":"TenaShop key test","customer":{"name":"Abel Adisu","phone":"****7843","email":"a***3@gmail.com"},
				 "checkoutUrl":"https://sandbox.checkout.billpay.et/checkout/SAVP8cfcnY_Go0signpzPSWkumu_ZA3-gUKI4CkrIqI",
				 "returnUrl":"https://example.ngrok-free.dev/api/billpay/return?order=TS-20261023-00002",
				 "createdAt":"2026-10-23T09:30:12.937614551Z","expiresAt":"2026-10-23T10:00:12.937614551Z",
				 "completedAt":null,"attempts":[]},
				 "timestamp":"2026-10-23T09:30:13.355+00:00"}
				""");
		assertThat(p.paymentId()).isEqualTo("6978e46a-1776-4a7a-81b8-f5c8a91512a5");
		assertThat(p.merchantReference()).isEqualTo("KEYTEST-1792747810");
		assertThat(p.checkoutUrl()).startsWith("https://sandbox.checkout.billpay.et/checkout/");
		assertThat(PaymentStatus.fromBillPay(p.status())).isEqualTo(PaymentStatus.PENDING);
		assertThat(p.amount()).isEqualByComparingTo("10.00");
		assertThat(p.currency()).isEqualTo("ETB");
		assertThat(p.expiresAt()).isNotNull();
	}

	@Test
	void readsFailureCodeAndInstrumentFromLatestAttempt() {
		// Shape of GET /api/v1/checkout/payments/{id} from the sandbox, 2026-10-23
		BillPayPayment p = parse("""
				{"statusCode":200,"message":"Payment fetched successfully","body":{
				 "id":"c3b74b33-14ad-4a02-b090-3015d5d3ad93","merchantReference":"TS-20261023-00003-A1",
				 "status":"FAILED","amount":{"amount":1450.0000,"currency":"ETB"},"checkoutUrl":null,
				 "attempts":[
				  {"attemptNo":1,"instrument":"TEST_CARD","status":"FAILED","failureCode":"CARD_EXPIRED"},
				  {"attemptNo":2,"instrument":"TEST_WALLET","status":"FAILED","failureCode":"INSUFFICIENT_FUNDS"}]}}
				""");
		assertThat(p.reasonCode()).isEqualTo("INSUFFICIENT_FUNDS");
		assertThat(p.paymentMethod()).isEqualTo("TEST_WALLET");
		assertThat(p.checkoutUrl()).isNull();
		assertThat(PaymentStatus.fromBillPay(p.status())).isEqualTo(PaymentStatus.FAILED);
	}

	@Test
	void readsRealPaymentCapturedWebhook() {
		// Delivered by BillPay sandbox on 2026-10-23 (header X-Billpay-Event: PaymentCaptured)
		String body = """
				{"eventId":"c3b74b33-14ad-4a02-b090-3015d5d3ad93","eventType":"PaymentCaptured",
				 "occurredAt":"2026-10-23T09:49:15.203932256Z","data":{
				 "paymentId":"c3b74b33-14ad-4a02-b090-3015d5d3ad93","merchantId":"cb24c910-d2c6-47e8-99de-84d0e84e3ac1",
				 "merchantReference":"TS-20261023-00003-A1","amount":1450.0000,"chargedAmount":1450.0000,"fee":0.0000,
				 "vat":0.0000,"netAmount":1450.0000,"currency":"ETB","provider":"SANDBOX_WALLET","instrument":"TEST_WALLET",
				 "capturedAt":"2026-10-23T09:49:15.012332869Z","attemptStartedAt":"2026-10-23T09:46:19.109426Z"}}
				""";
		BillPayPayment p = parse(body);
		String eventType = BillPayPayloads.text(json.readTree(body), "event", "eventType", "type");
		assertThat(BillPayPayloads.kind(eventType, p.status())).isEqualTo(BillPayPayloads.EventKind.PAYMENT);
		assertThat(PaymentStatus.fromBillPay(BillPayPayloads.statusFromEventType(eventType)))
				.isEqualTo(PaymentStatus.SUCCEEDED);
		assertThat(p.paymentId()).isEqualTo("c3b74b33-14ad-4a02-b090-3015d5d3ad93");
		assertThat(p.merchantReference()).isEqualTo("TS-20261023-00003-A1");
		assertThat(p.amount()).isEqualByComparingTo("1450.00");
		assertThat(p.currency()).isEqualTo("ETB");
		assertThat(p.paymentMethod()).isEqualTo("TEST_WALLET");
		assertThat(PaymentStatus.fromBillPay("CAPTURED")).isEqualTo(PaymentStatus.SUCCEEDED);
		assertThat(BillPayPayloads.kind("PaymentRefunded", null)).isEqualTo(BillPayPayloads.EventKind.REFUND);
		assertThat(BillPayPayloads.kind("PaymentSettled", null)).isEqualTo(BillPayPayloads.EventKind.SETTLEMENT);
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
