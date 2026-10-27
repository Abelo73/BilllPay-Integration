-- M7 cash on delivery: the buyer pays the seller in cash at the door instead of through BillPay.
-- The order is CASH_ON_DELIVERY until every seller marks "cash received", then PAID. The seller already holds the
-- money, so our commission is booked as a negative line on their balance when they collect it.
alter table orders add column payment_method varchar(20) not null default 'BILLPAY';
alter table order_parcels add column cash_collected_at timestamptz;

create index idx_orders_cash_open on orders (created_at) where payment_method = 'CASH' and status = 'CASH_ON_DELIVERY';
