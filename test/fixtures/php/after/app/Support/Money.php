<?php
namespace App\Support;

// Two classes with a method of the same name: calls must resolve within the class.
class Money
{
    public static function of(int $cents): self
    {
        return new static(static::clamp($cents));
    }

    private static function clamp(int $cents): int
    {
        return max(0, $cents);
    }

    public function format(): string
    {
        $fmt = fn (int $c) => number_format($c / 100, 2);
        return $fmt($this->cents());
    }

    private function cents(): int
    {
        return 0;
    }
}

class Percent
{
    public function format(): string
    {
        return $this->clamp() . '%';
    }

    private function clamp(): int
    {
        return 100;
    }
}
