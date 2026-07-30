/// <reference types="@webgpu/types" />

declare namespace App {
  interface Locals {}
  interface PageData {}
  interface PageState {}
  interface Platform {}
}

interface Navigator {
  gpu?: GPU;
}
