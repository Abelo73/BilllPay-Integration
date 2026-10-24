-- Before the sandbox/live switch (V11) the BillPay URL came from .env, so a few payments were made against live
-- BillPay while V11 labelled everything SANDBOX. Live checkout links are on checkout.billpay.et (sandbox ones on
-- sandbox.checkout.billpay.et): relabel those payments and their orders so status checks and refunds use live keys.
update payment_attempts set environment = 'LIVE'
where checkout_url like 'https://checkout.billpay.et/%';

update orders set environment = 'LIVE'
where id in (select order_id from payment_attempts where environment = 'LIVE');
