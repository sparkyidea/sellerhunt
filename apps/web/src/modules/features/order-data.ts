interface OrderItem {
  image: string;
  name: string;
  price: number;
  quantity: number;
}

interface Order {
  date: Date;
  id: string;
  orderItems: OrderItem[];
  shipping: number;
}

export const orderData: Order[] = [
  {
    id: "Oe31b70H",
    date: new Date("2023-06-23"),
    orderItems: [
      {
        name: "4K TV",
        image: "/home/sample-products/4k-tv.jpg",
        price: 1299,
        quantity: 1,
      },
    ],
    shipping: 30,
  },
  {
    id: "Xs785722",
    date: new Date("2023-06-24"),
    orderItems: [
      {
        name: "4K TV",
        image: "/home/sample-products/4k-tv.jpg",
        price: 1299,
        quantity: 1,
      },
      {
        name: "Rice Cooker",
        image: "/home/sample-products/rice-cooker.jpg",
        price: 50,
        quantity: 3,
      },
      {
        name: "Speaker",
        image: "/home/sample-products/speaker.jpg",
        price: 99,
        quantity: 2,
      },
    ],
    shipping: 0,
  },
  {
    id: "G772e310",
    date: new Date("2023-06-26"),
    orderItems: [
      {
        name: "RC Car",
        image: "/home/sample-products/rc-car.jpg",
        price: 549,
        quantity: 1,
      },
    ],
    shipping: 12,
  },
  {
    id: "Sg66k55L",
    date: new Date("2023-06-25"),
    orderItems: [
      {
        name: "Dog Toy",
        image: "/home/sample-products/dog-toy.jpg",
        price: 30,
        quantity: 4,
      },
      {
        name: "Pikachu Plush",
        image: "/home/sample-products/pikachu-plush.jpg",
        price: 40,
        quantity: 1,
      },
    ],
    shipping: 18,
  },
];
