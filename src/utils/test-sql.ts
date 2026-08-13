export interface SampleQuery {
  name: string;
  sql: string;
}

export const SAMPLE_QUERIES: SampleQuery[] = [
  {
    name: '基础 JOIN（用户·订单·商品）',
    sql: `SELECT
  u.id,
  u.name AS user_name,
  o.id AS order_id,
  o.created_at,
  oi.quantity,
  p.name AS product_name,
  p.price
FROM users u
INNER JOIN orders o ON u.id = o.user_id
INNER JOIN order_items oi ON o.id = oi.order_id
INNER JOIN products p ON oi.product_id = p.id
WHERE o.status = 'paid'
ORDER BY o.created_at DESC;`,
  },
  {
    name: 'CTE + 子查询',
    sql: `WITH user_orders AS (
  SELECT
    user_id,
    COUNT(*) AS order_count,
    SUM(amount) AS total_spent
  FROM orders
  WHERE created_at >= '2024-01-01'
  GROUP BY user_id
),
top_users AS (
  SELECT user_id
  FROM user_orders
  WHERE total_spent > 1000
)
SELECT
  u.name,
  uo.order_count,
  uo.total_spent,
  (SELECT COUNT(*) FROM reviews r WHERE r.user_id = u.id) AS review_count
FROM users u
INNER JOIN user_orders uo ON u.id = uo.user_id
WHERE u.id IN (SELECT user_id FROM top_users);`,
  },
  {
    name: 'CREATE TABLE（DDL + FK）',
    sql: `CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE orders (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  amount DECIMAL(10,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE order_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  order_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT DEFAULT 1,
  price DECIMAL(10,2),
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);`,
  },
  {
    name: 'INSERT...SELECT',
    sql: `INSERT INTO order_summary (user_id, total_orders, total_amount)
SELECT
  user_id,
  COUNT(*) AS total_orders,
  SUM(amount) AS total_amount
FROM orders
WHERE status = 'completed'
GROUP BY user_id;`,
  },
  {
    name: 'UPDATE + JOIN',
    sql: `UPDATE users u
SET vip_level = 'gold'
FROM (
  SELECT user_id
  FROM orders
  WHERE amount > 5000
  GROUP BY user_id
) big_spenders
WHERE u.id = big_spenders.user_id;`,
  },
];

export const DEFAULT_SQL = SAMPLE_QUERIES[0]?.sql ?? '';
